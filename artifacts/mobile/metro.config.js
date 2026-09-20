const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const extraBlockList = [
  /android[\/\\].*/,
  /\.expo[\/\\].*/,
];

if (Array.isArray(config.resolver.blockList)) {
  config.resolver.blockList.push(...extraBlockList);
} else if (config.resolver.blockList) {
  config.resolver.blockList = [config.resolver.blockList, ...extraBlockList];
} else {
  config.resolver.blockList = extraBlockList;
}

const prevEnhanceMiddleware = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware, server) => {
    const middleware = prevEnhanceMiddleware
      ? prevEnhanceMiddleware(metroMiddleware, server)
      : metroMiddleware;

    return (req, res, next) => {
      // Fix for Android emulator on Windows: OkHttp fails parsing large chunked multipart streams
      // with "java.net.ProtocolException: Expected leading [0-9a-fA-F] character but was 0xd".
      // Overriding multipart/mixed to application/javascript serves the complete bundle directly
      // with Content-Length, completely preventing the crash and allowing the emulator to load.
      if (req.headers && req.headers.accept && req.headers.accept.includes("multipart/mixed")) {
        req.headers.accept = req.headers.accept.replace(/multipart\/mixed/g, "application/javascript");
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = config;

