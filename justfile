default:
    @just --list

install:
    corepack enable
    pnpm install

dev:
    pnpm dev

format:
    pnpm format

lint:
    pnpm lint

build:
    pnpm build

typecheck:
    pnpm typecheck

test *args:
    pnpm exec vitest run {{ args }}

check:
    pnpm check

samples *args:
    pnpm samples out {{ args }}

e2e-install:
    pnpm test:e2e:install

e2e *args:
    pnpm test:e2e -- {{ args }}

e2e-run *args:
    pnpm test:e2e:run -- {{ args }}
