FROM python:alpine

WORKDIR /app
COPY index.html style.css script.js server.py ./

ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]
