return {
  "utilyre/barbecue.nvim",
  name = "barbecue",
  version = "*",
  dependencies = {
    "SmiteshP/nvim-navic",
  },

  config = function()
    -- --------------------------------------------------
    -- Make WinBar fully transparent (like lualine)
    -- --------------------------------------------------
    vim.api.nvim_create_autocmd("ColorScheme", {
      callback = function()
        vim.api.nvim_set_hl(0, "WinBar", { bg = "none" })
        vim.api.nvim_set_hl(0, "WinBarNC", { bg = "none" })
      end,
    })

    -- Apply once immediately (for current colorscheme)
    vim.api.nvim_set_hl(0, "WinBar", { bg = "none" })
    vim.api.nvim_set_hl(0, "WinBarNC", { bg = "none" })

    require("barbecue").setup({
      show_modified = false,
      show_dirname = true,
      show_basename = true,
      show_navic = true,

      symbols = {
        separator = "›",
        modified = "",
        ellipsis = "…",
      },

      theme = {
        -- Base text
        normal   = { fg = "#908caa", bg = "none" },

        -- Path hierarchy
        dirname  = { fg = "#737aa2" },
        basename = { fg = "#e0def4", bold = false },

        -- Context
        context  = { fg = "#908caa" },
      },
    })
  end,
}
