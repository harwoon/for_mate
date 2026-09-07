"""
ARBase (OpenAnimals, ICCV 2025, Hou et al.) 최대한 충실한 재구현.

- 백본: ResNet50-IBN-a (ImageNet 사전학습, torch.hub 'XingangPan/IBN-Net'), last stride 2->1
- MGN 스타일 3-브랜치: 전역(global) / 2-분할(part-2) / 3-분할(part-3), 각 브랜치 layer4 는 독립 복제
- 전역급 특징 3개(global 브랜치 pool, part-2/part-3 브랜치 각각의 global pool) -> triplet + BNNeck+CE
- 로컬 스트라이프 특징 5개(part-2 의 2조각 + part-3 의 3조각) -> BNNeck+CE 만
- 모든 특징은 1x1conv+BN 으로 256-d 로 축소(MGN 관례) -> 추론 시 8개(2048-d) concat

공식 코드/체크포인트가 공개되지 않아, 논문 설명(6.2절)과 원 MGN(2018)/BoT(2019) 논문 관례를 따른
최선의 재현이며 100% 동일 재현은 아님.
"""
import copy

import torch
import torch.nn as nn
import torch.nn.functional as F


def load_ibn_resnet50(pretrained=True):
    return torch.hub.load("XingangPan/IBN-Net", "resnet50_ibn_a", pretrained=pretrained, trust_repo=True)


def set_last_stride_1(layer4):
    layer4[0].conv2.stride = (1, 1)
    layer4[0].downsample[0].stride = (1, 1)
    return layer4


def weights_init_kaiming(m):
    classname = m.__class__.__name__
    if classname.find("Linear") != -1:
        nn.init.normal_(m.weight, std=0.001)
        if m.bias is not None:
            nn.init.constant_(m.bias, 0.0)
    elif classname.find("Conv") != -1:
        nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
    elif classname.find("BatchNorm") != -1:
        if m.affine:
            nn.init.constant_(m.weight, 1.0)
            nn.init.constant_(m.bias, 0.0)


class ReduceBlock(nn.Module):
    """MGN 관례: 2048-d 특징맵 -> 1x1 conv+BN+ReLU 로 256-d 로 축소."""

    def __init__(self, in_dim=2048, out_dim=256):
        super().__init__()
        self.conv = nn.Conv2d(in_dim, out_dim, kernel_size=1, bias=False)
        self.bn = nn.BatchNorm2d(out_dim)
        self.relu = nn.ReLU(inplace=True)
        self.apply(weights_init_kaiming)

    def forward(self, x):
        return self.relu(self.bn(self.conv(x)))


class BNNeckHead(nn.Module):
    """BoT BNNeck: pre-BN 특징은 triplet 용, post-BN 특징으로 분류(label smoothing CE)."""

    def __init__(self, in_dim, num_classes):
        super().__init__()
        self.bottleneck = nn.BatchNorm1d(in_dim)
        self.bottleneck.bias.requires_grad_(False)
        self.classifier = nn.Linear(in_dim, num_classes, bias=False)
        self.bottleneck.apply(weights_init_kaiming)
        self.classifier.apply(weights_init_kaiming)

    def forward(self, feat):
        bn_feat = self.bottleneck(feat)
        if self.training:
            return self.classifier(bn_feat), feat
        return bn_feat


class ARBase(nn.Module):
    feat_dim = 256

    def __init__(self, num_classes, pretrained_backbone=True):
        super().__init__()
        backbone = load_ibn_resnet50(pretrained=pretrained_backbone)
        self.stem = nn.Sequential(
            backbone.conv1, backbone.bn1, backbone.relu, backbone.maxpool,
            backbone.layer1, backbone.layer2, backbone.layer3,
        )
        base_layer4 = set_last_stride_1(backbone.layer4)
        self.branch_g = copy.deepcopy(base_layer4)
        self.branch_p2 = copy.deepcopy(base_layer4)
        self.branch_p3 = copy.deepcopy(base_layer4)

        self.reduce_g = ReduceBlock()
        self.reduce_p2_g = ReduceBlock()
        self.reduce_p3_g = ReduceBlock()
        self.reduce_p2_l = nn.ModuleList([ReduceBlock() for _ in range(2)])
        self.reduce_p3_l = nn.ModuleList([ReduceBlock() for _ in range(3)])

        n_heads = 3 + 2 + 3  # global-level 3 + local stripes 5
        self.heads = nn.ModuleList([BNNeckHead(self.feat_dim, num_classes) for _ in range(n_heads)])

    @staticmethod
    def _split_stripes(fmap, n):
        h = fmap.shape[2]
        edges = [round(h * i / n) for i in range(n + 1)]
        return [fmap[:, :, edges[i]:edges[i + 1], :] for i in range(n)]

    def forward(self, x):
        x = self.stem(x)
        fg, fp2, fp3 = self.branch_g(x), self.branch_p2(x), self.branch_p3(x)

        pooled = []  # (kind, 256-d feature)
        pooled.append(("global", self.reduce_g(F.adaptive_avg_pool2d(fg, 1)).flatten(1)))
        pooled.append(("global", self.reduce_p2_g(F.adaptive_avg_pool2d(fp2, 1)).flatten(1)))
        pooled.append(("global", self.reduce_p3_g(F.adaptive_avg_pool2d(fp3, 1)).flatten(1)))

        for i, stripe in enumerate(self._split_stripes(fp2, 2)):
            pooled.append(("local", self.reduce_p2_l[i](F.adaptive_avg_pool2d(stripe, 1)).flatten(1)))
        for i, stripe in enumerate(self._split_stripes(fp3, 3)):
            pooled.append(("local", self.reduce_p3_l[i](F.adaptive_avg_pool2d(stripe, 1)).flatten(1)))

        outs = [head(feat) for head, (_, feat) in zip(self.heads, pooled)]
        kinds = [k for k, _ in pooled]

        if self.training:
            cls_scores = [o[0] for o in outs]
            pre_bn_feats = [o[1] for o in outs]
            return cls_scores, pre_bn_feats, kinds
        return torch.cat(outs, dim=1)  # [B, 8*256=2048], 추론용 concat 특징

    def load_param(self, path):
        ck = torch.load(path, map_location="cpu", weights_only=False)
        sd = ck["model"] if "model" in ck else ck
        self.load_state_dict(sd)
