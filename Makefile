.PHONY: all build build-splunk-datasource

SHELL = BASH_ENV=.rc /bin/bash --noprofile

all: build

build: build-splunk-datasource

build-splunk-datasource:
	yarn install
	yarn build
