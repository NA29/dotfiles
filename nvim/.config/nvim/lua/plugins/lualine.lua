return {
  "nvim-lualine/lualine.nvim",
  config = function()
    require("lualine").setup({
      options = {
        theme = "auto", -- important: don't force a theme
        icons_enabled = false,
        component_separators = "",
        section_separators = "",
        globalstatus = true, -- single bar (cleaner)
        disabled_filetypes = {
          statusline = { "alpha", "dashboard" },
        },
      },

      sections = {
        lualine_a = {
          { "mode", color = { fg = "#908caa", bg = "none" } },
        },
        lualine_b = {
          {
            "diff",
            diff_color = {
              added    = { fg = "#908caa" },
              modified = { fg = "#908caa" },
              removed  = { fg = "#908caa" },
            },
            symbols = { added = "+", modified = "~", removed = "-" },
          },

          {
            "diagnostics",
            diagnostics_color = {
              error = { fg = "#908caa" },
              warn  = { fg = "#908caa" },
              info  = { fg = "#908caa" },
              hint  = { fg = "#908caa" },
            },
            symbols = { error = "!", warn = "?", info = "i", hint = "." },
          },
        },

        lualine_c = {
          { "filename", path = 1, color = { fg = "#e0def4", bg = "none" } },
        },
        lualine_x = {
          { "branch", color = { fg = "#908caa", bg = "none" } },
        },
        lualine_y = {
          { "progress", color = { fg = "#908caa", bg = "none" } }
        },
        lualine_z = {
          { "location", color = { fg = "#908caa", bg = "none" } },
        },
      },
    })
  end,
}
