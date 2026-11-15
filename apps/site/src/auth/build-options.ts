export const feedbackAuthBuild = {
  pure: {
    packages: [
      "better-auth",
      "@better-auth/*",
      "@pecunia/auth",
      "@pecunia/database",
      "vite",
    ],
  },
};

export const feedbackGatewayBuild = {
  pure: { packages: ["@pecunia/database"] },
};
