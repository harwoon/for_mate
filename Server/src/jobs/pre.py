from openai import OpenAI
import requests
import pandas as pd
import math
import time
import json
import re
import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OEPNAI_API_KEY")

# SERVICE_KEY = "rVRpoVnTdNeMrWNNUDsSnnhS%2FvGPUAIxURXK58dvIKYJO0ffmx8z8xAyZM6a8d%2BoB0mzr0YRZYwdkRmEaZVcrg%3D%3D"
SERVICE_KEY = os.getenv("APIS_KEY")
# BASE_URL = "https://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2"
BASE_URL = os.getenv("APIS_URL")
NUM_OF_ROWS = 1000

def fetch_page(page_no: int, num_of_rows: int = NUM_OF_ROWS) -> dict:
    url = (
        f"{BASE_URL}?serviceKey={SERVICE_KEY}"
        f"&numOfRows={num_of_rows}&pageNo={page_no}&_type=json"
    )
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()

def fetchFromAPI():
    # 1페이지를 먼저 호출해 전체 건수(totalCount) 확인
    first = fetch_page(1)
    body = first["response"]["body"]
    total_count = body["totalCount"]
    print("totalCount:", total_count)

    items = body["items"]["item"] if body.get("items") else []
    
    total_pages = math.ceil(total_count / NUM_OF_ROWS)

    for page_no in range(2, total_pages + 1):
        data = fetch_page(page_no)
        page_items = data["response"]["body"]["items"].get("item", [])
        items.extend(page_items)
        time.sleep(0.2)  # API 호출 간 간단한 딜레이
    print("수집된 총 건수:", len(items))

    return items

def preprocess_color(text):
    # 기타(...) 안의 내용만 추출
    text = re.sub(r'기타\((.*?)\)', r'\1', text)
    # 구분자들을 공백으로 치환
    text = re.sub(r'[&/,+]', ' ', text)
    return text.strip()

def preprocess(): 
    # prev 파일이 있으면 fetchFromAPI로 df를 만들고, 아니면 prev랑 비교해서 새로 가져온게 있다면, 중복제거
    df = pd.DataFrame(fetchFromAPI())
    
    df=df[~df.processState.isin(['종료(안락사)', '종료(자연사)','종료(방사)']) & (df.upKindNm != '기타')][['desertionNo', 'happenDt','happenPlace','upKindNm','kindNm','colorCd','age','weight','processState','sexCd','neuterYn','specialMark','careNm','careTel','careAddr','rfidCd','noticeSdt','noticeEdt','popfile1','popfile2']]
    
    df['desertionNo']= df.desertionNo.astype(int)
    df.loc[df['kindNm'] == '한국 고양이', 'kindNm'] = '코리안 숏헤어'
    
    colors = df.colorCd.tolist()
    
    df.to_csv("abandonment_animals.csv", index=False, encoding="utf-8-sig")
    print("저장 완료: abandonment_animals.csv")
    
    client = OpenAI(api_key=OPENAI_API_KEY)

    fewshots = [
        {"role": "user",
        "content": "흰색, 흰, 화이트, 하양, white"},
        {"role":"assistant", "content": "흰색"},
        {"role": "user",
        "content": "검정, 흑색, 블랙탄"},
        {"role":"assistant", "content": "검은색"},
        {"role": "user",
        "content": "갈색, 고동색, 적갈색,초코, 황토색"},
        {"role":"assistant", "content": "갈색"},
        {"role": "user",
        "content": "황색, 황, 노랑, 반치즈, 황토색"},
        {"role":"assistant", "content": "황색"},
        {"role": "user",
        "content": "회색, 회, 진회색, 재색, 울프그레이"},
        {"role":"assistant", "content": "회색"},
        {"role": "user",
        "content": "크림색, 베이지색, 아이보리, 살구색"},
        {"role":"assistant", "content": "크림색"},
        {"role": "user",
        "content": "혼합, 파티칼라, 등쪽은 어둡고 얼굴과 다리쪽은 옅은색, 샴, 얼룩무늬"},
        {"role":"assistant", "content": "기타"},
    ]
    
    system_instruction = (
        "당신은 색상 변환기 입니다.\n"
        "입력된 색상을 주어진 색상들(흰색, 검은색, 갈색, 황색, 회색, 크림색, 기타)로 분류하세요.\n"
        "띄어쓰기가 있다면 띄어쓰기 기준으로 분리하여 각각의 색상을 추론하여 띄어쓰기로 구분하여 출력하세요.\n"
        "설명, 부연설명, 따옴표, 제목을 추가하지 마세요.\n"
        "합성어 처럼 보이는 단어는 분리해서 색 추출 해줘 기타는 최소화 할수 있도록.\n"
        "추론한 색상명만 출력하세요.\n"
        
    )
    
    color_tags = []
    processed_colors = []
    response=""
    for color in colors:
        processed_colors.append(preprocess_color(color))
    for idx, color in enumerate(processed_colors): 
        print(f"llm 생성중... {idx}\n{color}")
        # if idx == 10: break
        messages = [
            {"role":"developer", "content":system_instruction},
            *fewshots,
            {"role":"user","content":color}
        ]
        
        try:
            response = client.responses.create(
                # model="gpt-5-nano",
                model="gpt-4.1-mini",
                input=messages,
                # reasoning={"effort":"low"}
                # max_output_tokens=500
                )
            # print(f"openai response :{response}")
            color_tags.append(response.output_text.strip())
            print(response.output_text.strip(), '\n')
        except Exception as e:
            print("### ERROR: 결과 생성 실패", e)
        
        
    
    
    with open("color_tags.json","w", encoding="utf-8-sig") as f:
            json.dump(color_tags, f, ensure_ascii=False)

    

preprocess()