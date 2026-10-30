return {
  "echasnovski/mini.indentscope",
  version = false,
  event = "BufReadPost",
  config = function()
    require("mini.indentscope").setup({
      symbol = "│",
      options = { try_as_border = true },
    })

    vim.api.nvim_create_autocmd("FileType", {
      pattern = { "markdown", "markdown_inline" },
      callback = function()
        vim.b.miniindentscope_disable = true
      end,
    })
  end,
}
