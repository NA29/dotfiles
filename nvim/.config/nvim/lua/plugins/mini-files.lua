return {
  "echasnovski/mini.files",
  version = false,
  keys = {
    {
      "<leader>e",
      function()
        require("mini.files").open(vim.api.nvim_buf_get_name(0))
      end,
      desc = "Open mini.files (cwd)",
    },
  },
  opts = {
    windows = {
      preview = true,
      width_focus = 30,
      width_preview = 50,
    },
  },
}
