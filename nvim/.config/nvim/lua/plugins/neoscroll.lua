return {
  "karb94/neoscroll.nvim",
  event = "WinScrolled",
  config = function()
    local neoscroll = require("neoscroll")
    neoscroll.setup({
      easing_function = "linear",
      hide_cursor = true,
      stop_eof = true,
      respect_scrolloff = true,
      cursor_scrolls_alone = true,
    })

    local scroll = neoscroll.scroll
    local keymap = vim.keymap.set

    keymap("n", "<C-d>", function()
      scroll(vim.wo.scroll, { duration = 50 })
    end, { silent = true })

    keymap("n", "<C-u>", function()
      scroll(-vim.wo.scroll, { duration = 50 })
    end, { silent = true })

    keymap("n", "<C-f>", function()
      scroll(vim.api.nvim_win_get_height(0), { duration = 100 })
    end, { silent = true })

    keymap("n", "<C-b>", function()
      scroll(-vim.api.nvim_win_get_height(0), { duration = 100 })
    end, { silent = true })
  end,
}
