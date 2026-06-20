const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// pnpm hoisting 환경에서 React 중복 인스턴스 방지
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react" || moduleName === "react-native") {
    return {
      filePath: path.resolve(__dirname, "node_modules", moduleName, "index.js"),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
