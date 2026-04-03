# Multi-arch compatible: works on arm64 (Apple Silicon) and amd64
FROM amazoncorretto:17-alpine

WORKDIR /brouter

RUN apk add --no-cache wget curl unzip bash && \
    wget -q https://github.com/abrensch/brouter/releases/download/1.7.4/brouter_1.7.4.zip -O brouter.zip && \
    unzip -q brouter.zip && \
    rm brouter.zip && \
    mv brouter_1.7.4/* . && \
    rmdir brouter_1.7.4 || true

RUN mkdir -p segments profiles

# Download default routing profiles (network optional at build time — entrypoint retries)
RUN wget -q https://raw.githubusercontent.com/abrensch/brouter/master/misc/profiles2/trekking.brf   -O profiles/trekking.brf  2>/dev/null || true && \
    wget -q https://raw.githubusercontent.com/abrensch/brouter/master/misc/profiles2/fastbike.brf   -O profiles/fastbike.brf  2>/dev/null || true && \
    wget -q https://raw.githubusercontent.com/abrensch/brouter/master/misc/profiles2/hiking-beta.brf -O profiles/hiking.brf    2>/dev/null || true && \
    wget -q https://raw.githubusercontent.com/abrensch/brouter/master/misc/profiles2/safety.brf     -O profiles/road.brf      2>/dev/null || true

EXPOSE 17777

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
