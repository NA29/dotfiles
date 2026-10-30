return {
  "neovim/nvim-lspconfig",
  dependencies = {
    "williamboman/mason.nvim",
    "williamboman/mason-lspconfig.nvim",
    "hrsh7th/nvim-cmp",
    "hrsh7th/cmp-nvim-lsp",
    "hrsh7th/cmp-buffer",
    "hrsh7th/cmp-path",
    "SmiteshP/nvim-navic",
  },
  config = function()
    require("mason").setup()
    require("mason-lspconfig").setup({
      ensure_installed = {
        "lua_ls", "ts_ls", "eslint", "pyright", "clangd", "marksman",
      },
    })

    local capabilities = require("cmp_nvim_lsp").default_capabilities()

    local on_attach = function(_, bufnr)
      local opts = { buffer = bufnr, silent = true }
      vim.keymap.set("n", "gd", vim.lsp.buf.definition, opts)
      vim.keymap.set("n", "gD", function()
        vim.cmd("vsplit")
        vim.lsp.buf.definition()
      end, opts)
      vim.keymap.set("n", "gi", vim.lsp.buf.implementation, opts)
      vim.keymap.set("n", "gI", function()
        vim.cmd("vsplit")
        vim.lsp.buf.implementation()
      end, opts)
      vim.keymap.set("n", "gr", vim.lsp.buf.references, opts)
      vim.keymap.set("n", "gy", vim.lsp.buf.type_definition, opts)
      vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)
    end

    vim.lsp.config("lua_ls", {
      capabilities = capabilities,
      on_attach = on_attach,
      settings = {
        Lua = { diagnostics = { globals = { "vim" } } },
      },
    })

    for _, server in ipairs({
      "ts_ls", "eslint", "pyright", "clangd", "marksman"
    }) do
      vim.lsp.config(server, {
        capabilities = capabilities,
        on_attach = on_attach,
      })
    end
  end,
}
