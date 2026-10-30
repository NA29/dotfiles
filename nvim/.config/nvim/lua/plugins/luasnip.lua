return {
  "L3MON4D3/LuaSnip",
  dependencies = { "saadparwaiz1/cmp_luasnip" },
  config = function()
    local ls = require("luasnip")
    local s  = ls.snippet
    local t  = ls.text_node
    local i  = ls.insert_node

    ls.config.set_config({
      history = false,
      updateevents = "TextChanged,TextChangedI",
      region_check_events = "CursorMoved,CursorHold,InsertEnter",
      delete_check_events = "TextChanged,InsertLeave",
      enable_autosnippets = false,
    })

    ls.add_snippets("cpp", {
      s("nl", { t("\\n") }),
    })

    ls.add_snippets("markdown", {
      s("note", { t("> **Note:** "), i(1) }),
      s("tip", { t("> **Tip:** "), i(1) }),
      s("warn", { t("> **Warning:** "), i(1) }),
      s("info", { t("> **Info:** "), i(1) }),

      s("def", {
        t("**"), i(1, "Term"), t("** — "), i(2, "definition"),
      }),

      s("bold", { t("**"), i(1), t("**") }),
      s("italic", { t("*"), i(1), t("*") }),
      s("code", { t("`"), i(1), t("`") }),
      s("strike", { t("~~"), i(1), t("~~") }),

      s("link", { t("["), i(1), t("]("), i(2), t(")") }),
      s("img", { t("!["), i(1), t("]("), i(2), t(")") }),

      s("cb", {
        t("```"), i(1, "language"),
        t({ "", "" }),
        i(2),
        t({ "", "```" }),
      }),

      s("ul", { t("- "), i(1) }),
      s("ol", { t("1. "), i(1) }),
      s("task", { t("- [ ] "), i(1) }),

      s("h1", { t("# "), i(1) }),
      s("h2", { t("## "), i(1) }),
      s("h3", { t("### "), i(1) }),
      s("h4", { t("#### "), i(1) }),
      s("h5", { t("##### "), i(1) }),
      s("h6", { t("###### "), i(1) }),

      s("nl", { t("\\n") }),
    })
  end,
}
