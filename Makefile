.PHONY: all build build-splunk-datasource up down release

SHELL = BASH_ENV=.rc /bin/bash --noprofile

all: build up

build: build-splunk-datasource

build-splunk-datasource:
	yarn install
	yarn build

up:
	docker compose -f docker-compose.yaml up -d

down:
	-docker compose -f docker-compose.yaml down

release:
	npx semantic-release $(RELEASE_OPTS)
