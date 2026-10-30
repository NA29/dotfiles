return {
  "goolord/alpha-nvim",
  dependencies = { "nvim-tree/nvim-web-devicons" },
  config = function()
    local alpha = require("alpha")
    local dashboard = require("alpha.themes.dashboard")

    dashboard.section.buttons.val = {
      dashboard.button("e", "  New file", ":ene <BAR> startinsert <CR>"),
      dashboard.button("f", "󰈞  Find file", ":Telescope find_files<CR>"),
      dashboard.button("h", "󰋚  Recently opened files", ":Telescope oldfiles<CR>"),
      dashboard.button("g", "󰊄  Find word", ":Telescope live_grep<CR>"),
      dashboard.button("q", "󰩈  Quit Neovim", ":qa<CR>"),
    }

    dashboard.section.footer.val = require("fortune").get_fortune()
    alpha.setup(dashboard.config)
  end,
}
