FROM nginx:alpine

# Remover configuração padrão
RUN rm /etc/nginx/conf.d/default.conf

# Copiar arquivos do frontend
COPY . /usr/share/nginx/html

# Copiar configuração customizada do Nginx
COPY nginx.conf /etc/nginx/conf.d/ppc-gestao.conf

EXPOSE 80

RUN chmod -R 755 /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]

# Copiar configuração do Nginx
COPY default.conf /etc/nginx/conf.d/default.conf
