CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id                TEXT        PRIMARY KEY,
    name              TEXT        NOT NULL UNIQUE,
    display_name      TEXT        NOT NULL DEFAULT '',
    phone             TEXT        NOT NULL DEFAULT '',
    city              TEXT        NOT NULL DEFAULT '',
    role              TEXT        NOT NULL DEFAULT '',
    bio               TEXT        NOT NULL DEFAULT '',
    avatar_url        TEXT        NOT NULL DEFAULT '',
    experience        TEXT        NOT NULL DEFAULT '',
    job_type          TEXT        NOT NULL DEFAULT '',
    expected_salary    BIGINT,
    skills            TEXT[]      NOT NULL DEFAULT '{}',
    availability_list TEXT[]      NOT NULL DEFAULT '{}',
    telegram_chat_id  BIGINT,
    rating            FLOAT       NOT NULL DEFAULT 0,
    tg_verified       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS experience TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS expected_salary BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_list TEXT[] NOT NULL DEFAULT '{}';

UPDATE users
SET display_name = COALESCE(NULLIF(display_name, ''), name),
    phone = COALESCE(NULLIF(phone, ''), ''),
    city = COALESCE(NULLIF(city, ''), ''),
    role = COALESCE(NULLIF(role, ''), ''),
    bio = COALESCE(NULLIF(bio, ''), ''),
    avatar_url = COALESCE(NULLIF(avatar_url, ''), ''),
    experience = COALESCE(NULLIF(experience, ''), ''),
    job_type = COALESCE(NULLIF(job_type, ''), ''),
    availability_list = COALESCE(availability_list, '{}'::text[])
WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_users_name_lower ON users (LOWER(name));

CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT        PRIMARY KEY,
    author_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT        NOT NULL,
    description   TEXT        NOT NULL DEFAULT '',
    job_type      TEXT        NOT NULL,
    work_format   TEXT        NOT NULL DEFAULT '',
    city          TEXT        NOT NULL DEFAULT '',
    address       TEXT        NOT NULL DEFAULT '',
    salary        TEXT        NOT NULL DEFAULT '',
    contact_phone TEXT        NOT NULL DEFAULT '',
    urgent        BOOLEAN     NOT NULL DEFAULT FALSE,
    skills        TEXT[]      NOT NULL DEFAULT '{}',
    availability  TEXT[]      NOT NULL DEFAULT '{}',
    experience_required TEXT  NOT NULL DEFAULT '',
    event_date    TEXT        NOT NULL DEFAULT '',
    people_needed BIGINT,
    image_url     TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contact_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS experience_required TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS event_date TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS people_needed BIGINT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_jobs_author_id ON jobs(author_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS otp_codes (
    user_id    TEXT        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code       TEXT        NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_registrations (
    user_id    TEXT        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_token ON pending_registrations (token);
