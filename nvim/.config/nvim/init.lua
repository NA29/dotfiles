vim.cmd("set expandtab")
vim.cmd("set tabstop=2")
vim.cmd("set softtabstop=2")
vim.cmd("set shiftwidth=2")
vim.cmd("set number")
vim.cmd("set relativenumber")
vim.g.markdown_recommended_style = 0
vim.opt.cursorline = true
vim.opt.scrolloff = 8
vim.opt.ignorecase = true
vim.opt.smartcase = true
-- vim.opt.scrolljump = 1
-- vim.opt.virtualedit = "onemore"
vim.opt.smoothscroll = true
vim.opt.splitright = true
vim.opt.splitbelow = true
vim.g.mapleader = " "
vim.opt.wrap = true


-- =========================
-- lazy.nvim bootstrap
-- =========================
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable",
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- =========================
-- Diagnostics UI
-- =========================
vim.diagnostic.config({
  float = {
    border = "rounded",
  },
  severity_sort = true,
})

vim.keymap.set(
  "n",
  "ge",
  vim.diagnostic.open_float,
  { desc = "Show diagnostic under cursor" }
)

vim.keymap.set("n", "<leader>m", function()
  require("conform").format({
    timeout_ms = 2000,
  })
end, { desc = "Format buffer" })


-- Moving lines up and down with Alt
vim.keymap.set("n", "<A-j>", ":m .+1<CR>==", { desc = "Move line down" })
vim.keymap.set("n", "<A-k>", ":m .-2<CR>==", { desc = "Move line up" })
vim.keymap.set("v", "<A-j>", ":m '>+1<CR>gv=gv", { desc = "Move selection down" })
vim.keymap.set("v", "<A-k>", ":m '<-2<CR>gv=gv", { desc = "Move selection up" })
vim.keymap.set({ "n", "v" }, "<leader>y", '"+y')
vim.keymap.set({ "n", "v" }, "<leader>u", 'ggVG"+y')

vim.keymap.set('n', '<Esc>', '<cmd>noh<CR>', { silent = true })

require("lazy").setup("plugins")
