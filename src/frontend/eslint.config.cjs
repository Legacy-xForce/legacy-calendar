const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");
const pluginVue = require("eslint-plugin-vue");
const prettierConfig = require("eslint-plugin-prettier/recommended");

module.exports = tseslint.config(
    {
        ignores: ["dist", "node_modules", "*.config.js", "*.config.cjs", ".agents", "src/types/api.generated.ts"]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...pluginVue.configs["flat/essential"],
    prettierConfig,
    {
        files: ["**/*.vue"],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
            },
        },
    },
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            ecmaVersion: "latest",
            sourceType: "module",
        },
    },
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "vue/html-indent": "off",
            "vue/multi-word-component-names": "off",
            "vue/max-attributes-per-line": "off",
        },
    }
);
