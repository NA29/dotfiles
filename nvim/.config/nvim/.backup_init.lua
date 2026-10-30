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

vim.keymap.set("n", "<leader>fm", function()
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

-- =========================
-- Plugins
-- =========================
local plugins = {
  {
    "catppuccin/nvim",
    name = "catppuccin",
    priority = 1000,
    lazy = false,
    config = function()
      require("catppuccin").setup({
        transparent_background = true,
      })
      vim.cmd.colorscheme("catppuccin")
    end,
  },

  {
    "nvim-telescope/telescope.nvim",
    tag = "v0.2.0",
    dependencies = { "nvim-lua/plenary.nvim" },
    config = function()
      local builtin = require("telescope.builtin")
      vim.keymap.set("n", "<C-p>", builtin.find_files, {})
      vim.keymap.set("n", "<leader>f", builtin.live_grep, {})
    end,
  },

  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    lazy = false,
    opts = {
      ensure_installed = {
        "c",
        "cpp",
        "python",
        "javascript",
        "typescript",
        "lua",
        "vim",
        "vimdoc",
        "query",
        "markdown",
        "markdown_inline",
        "html",
        "css",
        "java",
      },
      highlight = {
        enable = true,
        additional_vim_regex_highlighting = false,
      },
      indent = { enable = true },
      incremental_selection = { enable = true },
    },
  },

  {
    "windwp/nvim-autopairs",
    event = "InsertEnter",
    config = function()
      require("nvim-autopairs").setup({})
    end,
  },

  {
    "windwp/nvim-ts-autotag",
    event = { "BufReadPre", "BufNewFile" },
    config = function()
      require("nvim-ts-autotag").setup({
        opts = {
          enable_close = true,
          enable_rename = true,
          enable_close_on_slash = false,
        },
      })
    end,
  },

  {
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
      -- =========================
      -- Mason
      -- =========================
      require("mason").setup()

      require("mason-lspconfig").setup({
        ensure_installed = {
          "lua_ls",
          "ts_ls",
          "eslint",
          "pyright",
          "clangd",
          "marksman",
        },
      })

      -- =========================
      -- nvim-cmp
      -- =========================
      local cmp = require("cmp")
      local luasnip = require("luasnip")

      cmp.setup({
        mapping = cmp.mapping.preset.insert({
          ["<Tab>"] = cmp.mapping(function(fallback)
            if cmp.visible() then
              cmp.select_next_item()
            elseif luasnip.expand_or_jumpable() then
              luasnip.expand_or_jump()
            else
              fallback()
            end
          end, { "i", "s" }),

          ["<S-Tab>"] = cmp.mapping(function(fallback)
            if cmp.visible() then
              cmp.select_prev_item()
            elseif luasnip.jumpable(-1) then
              luasnip.jump(-1)
            else
              fallback()
            end
          end, { "i", "s" }),

          ["<CR>"] = cmp.mapping.confirm({ select = false }),
          ["<C-g>"] = cmp.mapping.abort(),
        }),
        sources = {
          { name = "luasnip" },
          { name = "nvim_lsp" },
          { name = "buffer" },
          { name = "path" },
        },
      })

      -- =========================
      -- LSP setup
      -- =========================
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

      -- =========================
      -- Servers
      -- =========================

      vim.lsp.config("lua_ls", {
        capabilities = capabilities,
        on_attach = on_attach,
        settings = {
          Lua = {
            diagnostics = { globals = { "vim" } },
          },
        },
      })

      vim.lsp.config("ts_ls", {
        capabilities = capabilities,
        on_attach = on_attach,
      })

      vim.lsp.config("eslint", {
        capabilities = capabilities,
        on_attach = on_attach,
      })

      vim.lsp.config("pyright", {
        capabilities = capabilities,
        on_attach = on_attach,
      })

      vim.lsp.config("clangd", {
        capabilities = capabilities,
        on_attach = on_attach,
      })

      vim.lsp.config("marksman", {
        capabilities = capabilities,
        on_attach = on_attach,
      })
    end,
  },

  {
    "stevearc/conform.nvim",
    event = "BufWritePre",
    opts = {
      -- Format on save
      format_on_save = {
        timeout_ms = 500,
        lsp_format = "fallback",
      },
      -- Which formatter to use per filetype
      formatters_by_ft = {
        -- C / C++
        c = { "clang-format" },
        cpp = { "clang-format" },

        -- TypeScript / JavaScript
        javascript = { "prettier" },
        javascriptreact = { "prettier" },
        typescript = { "prettier" },
        typescriptreact = { "prettier" },

        -- Python
        python = { "black" },

        -- Markdown
        markdown = { "prettier" },
      },
    },
  },

  {
    "nvim-lualine/lualine.nvim",
    config = function()
      require("lualine").setup({
        options = {
          theme = "dracula",
        },
      })
    end,
  },

  -- =========================
  -- Breadcrumbs (winbar)
  -- =========================
  {
    "utilyre/barbecue.nvim",
    name = "barbecue",
    version = "*",
    dependencies = {
      "SmiteshP/nvim-navic",
      "nvim-tree/nvim-web-devicons",
    },
    config = function()
      require("barbecue").setup({
        show_dirname = true,
        show_basename = true,
        show_modified = true,
        symbols = {
          separator = " › ",
        },
      })
    end,
  },

  {
    "rainbowhxch/accelerated-jk.nvim",
    config = function()
      require("accelerated-jk").setup()
    end,
  },
  {
    'MeanderingProgrammer/render-markdown.nvim',
    dependencies = {
      'nvim-treesitter/nvim-treesitter',
      'nvim-tree/nvim-web-devicons',
    },
    opts = {
      restart_highlighter = true,
      code = {
        enabled = true,
        sign = true,
        style = 'full', -- Use 'full' style for complete treesitter highlighting
        position = 'right',
        width = 'block',
        left_pad = 2,
        right_pad = 2,
        left_margin = 1,
        border = 'thin',
        above = '▁',
        below = '▔',
        language_left = '█',
        language_right = '█',
        language_border = '▁',
        highlight = 'RenderMarkdownCode',
      },
    },
  },
  {
    "rubiin/fortune.nvim",
    config = function()
      require("fortune").setup()
    end,
  },
  {
    "goolord/alpha-nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    config = function()
      local alpha = require("alpha")
      local dashboard = require("alpha.themes.dashboard")

      dashboard.section.buttons.val = {
        dashboard.button("e", "  New file", ":ene <BAR> startinsert <CR>"),
        dashboard.button("f", "󰈞  Find file", ":Telescope find_files<CR>"),
        dashboard.button("h", "󰋚  Recently opened files", ":Telescope oldfiles<CR>"),
        dashboard.button("r", "󰑕  Frecency / MRU", ":Telescope frecency<CR>"),
        dashboard.button("g", "󰊄  Find word", ":Telescope live_grep<CR>"),
        dashboard.button("m", "󰃀  Jump to bookmarks", ":Telescope marks<CR>"),
        dashboard.button("q", "󰩈  Quit Neovim", ":qa<CR>"),
      }

      dashboard.section.footer.val = require("fortune").get_fortune()

      alpha.setup(dashboard.config)
    end,
  },
  {
    "L3MON4D3/LuaSnip",
    dependencies = { "saadparwaiz1/cmp_luasnip" },
    config = function()
      local ls = require("luasnip")
      local s  = ls.snippet
      local t  = ls.text_node
      local i  = ls.insert_node

      ls.config.set_config({
        history = false, -- do NOT keep around old snippets
        updateevents = "TextChanged,TextChangedI",
        region_check_events = "CursorMoved,CursorHold,InsertEnter",
        delete_check_events = "TextChanged,InsertLeave",
        enable_autosnippets = false,
      })
      ls.add_snippets("cpp", {
        s("nl", { t("\\n") })
      })

      ls.add_snippets("markdown", {

        -- Notes / callouts
        s("note", { t("> **Note:** "), i(1) }),
        s("tip", { t("> **Tip:** "), i(1) }),
        s("warn", { t("> **Warning:** "), i(1) }),
        s("info", { t("> **Info:** "), i(1) }),

        -- Definition
        s("def", {
          t("**"),
          i(1, "Term"),
          t("** — "),
          i(2, "definition"),
        }),

        -- Formatting
        s("bold", { t("**"), i(1), t("**") }),
        s("italic", { t("*"), i(1), t("*") }),
        s("code", { t("`"), i(1), t("`") }),
        s("strike", { t("~~"), i(1), t("~~") }),

        -- Links / images
        s("link", { t("["), i(1), t("]("), i(2), t(")") }),
        s("img", { t("!["), i(1), t("]("), i(2), t(")") }),

        -- Code blocks
        s("cb", {
          t("```"), i(1, "language"),
          t({ "", "" }),
          i(2),
          t({ "", "```" }),
        }),

        -- Lists
        s("ul", { t("- "), i(1) }),
        s("ol", { t("1. "), i(1) }),
        s("task", { t("- [ ] "), i(1) }),

        -- Headings
        s("h1", { t("# "), i(1) }),
        s("h2", { t("## "), i(1) }),
        s("h3", { t("### "), i(1) }),
        s("h4", { t("#### "), i(1) }),
        s("h5", { t("##### "), i(1) }),
        s("h6", { t("###### "), i(1) }),

        -- Newline
        s("nl", { t("\\n") }),
      })
    end,
  },

  {
    "numToStr/Comment.nvim",
    config = function()
      require("Comment").setup()
    end,
  },
  {
    'Aasim-A/scrollEOF.nvim',
    event = { 'CursorMoved', 'WinScrolled' },
    opts = {},
    config = function()
      require('scrollEOF').setup()
    end
  },
  {
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

      local keymap = vim.keymap.set
      local scroll = neoscroll.scroll

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
  },
  {
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
  ,
  {
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
  },

  {
    'mluders/comfy-line-numbers.nvim',
    config = function()
      require('comfy-line-numbers').setup({
        labels = {
          '1', '2', '3', '4', '5',
          '11', '12', '13', '14', '15',
          '21', '22', '23', '24', '25',
          '31', '32', '33', '34', '35',
          '41', '42', '43', '44', '45',
          '51', '52', '53', '54', '55',
          '111', '112', '113', '114', '115',
          '121', '122', '123', '124', '125',
          '131', '132', '133', '134', '135',
          '141', '142', '143', '144', '145',
          '151', '152', '153', '154', '155',
          '211', '212', '213', '214', '215',
          '221', '222', '223', '224', '225',
          '231', '232', '233', '234', '235',
          '241', '242', '243', '244', '245',
          '251', '252', '253', '254', '255',
        },

        up_key = 'k',
        down_key = 'j',

        -- Line numbers will be completely hidden for the following file/buffer types
        hidden_file_types = { 'undotree' },
        hidden_buffer_types = { 'terminal', 'nofile' },
      })
    end,
  }

}

require("lazy").setup(plugins, {})
