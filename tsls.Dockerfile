FROM node:18.16.1
ARG project_path
WORKDIR ${project_path:?}
RUN corepack enable
RUN corepack prepare yarn@stable --activate
CMD ["yarn", "run", "typescript-language-server", "--stdio"]
