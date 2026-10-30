return {
  "stevearc/conform.nvim",
  event = "BufWritePre",
  opts = {
    format_on_save = {
      timeout_ms = 500,
      lsp_format = "fallback",
    },
    formatters_by_ft = {
      c = { "clang-format" },
      cpp = { "clang-format" },
      javascript = { "prettier" },
      javascriptreact = { "prettier" },
      typescript = { "prettier" },
      typescriptreact = { "prettier" },
      python = { "black" },
      markdown = { "prettier" },
    },
  },
}
