FROM nginx:alpine
 
# Substitui a configuração padrão pelo seu arquivo
COPY default.conf /etc/nginx/conf.d/default.conf
 
# Copie SOMENTE os arquivos do site (idealmente uma pasta /site)
COPY ./site/ /usr/share/nginx/html/
 
# (Opcional) permissões — geralmente nem precisa no nginx:alpine
RUN chmod -R 755 /usr/share/nginx/html
 
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]