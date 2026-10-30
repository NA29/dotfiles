return {
  "MeanderingProgrammer/render-markdown.nvim",
  dependencies = {
    "nvim-treesitter/nvim-treesitter",
    "nvim-tree/nvim-web-devicons",
  },
  opts = {
    restart_highlighter = true,
    code = {
      enabled = true,
      sign = true,
      style = "full",
      position = "right",
      width = "block",
      left_pad = 2,
      right_pad = 2,
      left_margin = 1,
      border = "thin",
      above = "▁",
      below = "▔",
      language_left = "█",
      language_right = "█",
      language_border = "▁",
      highlight = "RenderMarkdownCode",
    },
  },
}
