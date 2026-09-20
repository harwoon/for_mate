BEGIN;

CREATE TABLE comments (
    id          BIGSERIAL PRIMARY KEY,
    post_type   VARCHAR(10) NOT NULL
        CHECK (post_type IN ('lost', 'found')),
    post_id     BIGINT NOT NULL,
    user_id     BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    parent_id   BIGINT
        REFERENCES comments(id) ON DELETE CASCADE,
    content     VARCHAR(1000) NOT NULL,
    is_secret   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP
);

CREATE INDEX idx_comments_post
    ON comments (post_type, post_id, created_at, id);

CREATE INDEX idx_comments_parent
    ON comments (parent_id);

COMMIT;
