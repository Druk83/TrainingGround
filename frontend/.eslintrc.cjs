module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:lit/recommended",
    "plugin:lit-a11y/recommended",
    "plugin:wc/recommended",
    "plugin:prettier/recommended"
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    project: false,
    ecmaVersion: "latest"
  },
  plugins: ["@typescript-eslint", "lit", "lit-a11y", "wc", "prettier"],
  settings: {
    "import/resolver": {
      typescript: {
        project: "./tsconfig.json"
      }
    }
  },
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }
    ],
    "prettier/prettier": "warn",
    "wc/no-constructor-params": "off",
    "wc/require-listener-teardown": "warn"
  },
  ignorePatterns: ["dist", "node_modules", "src/sw.ts"]
};
