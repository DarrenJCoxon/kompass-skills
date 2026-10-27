# GitHub's runner plus what GitHub-hosted Ubuntu images provide that LiteBench checks rely on:
# Node 20, 22 and 24 via fnm (20 is the default on PATH), Corepack for each (each repo's
# packageManager pin chooses its pnpm/yarn version), build-essential and psql.
# A check script selects another major with `eval "$(fnm env)" && fnm use 24`, or runs
# `fnm use` with no version to read the repo's .nvmrc / .node-version.
FROM ghcr.io/actions/actions-runner:latest
USER root
# The checksums below are for this version's release assets; update them together.
ARG FNM_VERSION=1.39.0
ARG TARGETARCH
ENV FNM_DIR=/opt/fnm
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates unzip build-essential postgresql-client procps \
 && case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
      amd64) asset=fnm-linux.zip; sum=7807664f39d39fc518da1c35ba0181e4b3267603c4b1dedeb4b5fc6ae440a224 ;; \
      arm64) asset=fnm-arm64.zip; sum=4eaff58b2c5bf30d0934027572dd0b5bbb60d2a1af309230b53662d4b1d45599 ;; \
      *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac \
 && curl -fsSL -o /tmp/fnm.zip "https://github.com/Schniz/fnm/releases/download/v${FNM_VERSION}/${asset}" \
 && echo "${sum}  /tmp/fnm.zip" | sha256sum -c - \
 && unzip -q /tmp/fnm.zip -d /usr/local/bin && chmod 755 /usr/local/bin/fnm && rm /tmp/fnm.zip \
 && for major in 20 22 24; do fnm install "$major" && fnm exec --using="$major" corepack enable; done \
 && fnm default 20 \
 && chmod -R a+rX "$FNM_DIR" \
 && apt-get clean
# Docker Compose plugin, so `docker compose` works against the box's private engine
# (projects start their test databases with it). Checksums match this version's assets.
ARG COMPOSE_VERSION=5.6.0
RUN case "${TARGETARCH:-$(dpkg --print-architecture)}" in \
      amd64) asset=docker-compose-linux-x86_64; sum=40343e21ca777173e69cff5dbafeb37c6f81f3b0d57d9e597f036e95eb63e76a ;; \
      arm64) asset=docker-compose-linux-aarch64; sum=733ec76717ceb59052a9609b9dadfb523b2df8eab57a54212872d10a58078ea2 ;; \
      *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac \
 && mkdir -p /usr/local/lib/docker/cli-plugins \
 && curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/${asset}" \
 && echo "${sum}  /usr/local/lib/docker/cli-plugins/docker-compose" | sha256sum -c - \
 && chmod 755 /usr/local/lib/docker/cli-plugins/docker-compose
ENV PATH=/opt/fnm/aliases/default/bin:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY hooks/ /hooks/
COPY entrypoint.sh /entrypoint.sh
USER runner
ENTRYPOINT ["/bin/bash", "/entrypoint.sh"]
