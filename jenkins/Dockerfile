# Jenkins for the EventTix pipeline: the official image plus the tools the pipeline needs.
FROM jenkins/jenkins:lts-jdk21

USER root

# - Docker CLI + Compose: build images and start containers on Docker Desktop
#   (through the mounted Docker socket, see docker-compose.yml)
# - Node.js 22: run the backend tests, npm audit and the SonarQube scanner
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && chmod a+r /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin nodejs \
 && rm -rf /var/lib/apt/lists/*

USER jenkins

# Plugins are installed at build time so the setup is repeatable.
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
