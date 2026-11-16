import { Button } from "@foldkit/ui";
import * as stylex from "@stylexjs/stylex";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "../../client/pecunia/message.js";
import type { PecuniaMessage } from "../../client/pecunia/message.js";
import type { PecuniaModel, ThemeValue } from "../../client/pecunia/model.js";
import { dashboardRouter } from "../../client/pecunia/route.js";
import { isCurrent, menuSections } from "./navigation.js";
import { layout, styles } from "./pecunia.stylex.js";
import { darkPecunia } from "./tokens.stylex.js";

const className = (style: stylex.StyleXStyles) =>
  stylex.props(style).className ?? "";

const themeButton = (
  theme: ThemeValue,
  label: string,
  model: PecuniaModel,
  h: HtmlBuilder<PecuniaMessage>
): Html =>
  Button.view(
    {
      onClick: Message.ClickedTheme({ theme }),
      toView: ({ button }) =>
        h.button(
          [
            ...button,
            h.AriaPressed(String(model.theme === theme)),
            h.Class(
              stylex.props(
                styles.themeButton,
                model.theme === theme && styles.themeButtonActive,
                styles.focus
              ).className ?? ""
            ),
          ],
          [label]
        ),
    },
    h
  );

const themeControl = (
  model: PecuniaModel,
  h: HtmlBuilder<PecuniaMessage>
): Html =>
  h.div(
    [
      h.AriaLabel("Theme"),
      h.Class(className(styles.themeGroup)),
      h.Role("group"),
    ],
    [
      themeButton("light", "Light", model, h),
      themeButton("dark", "Dark", model, h),
    ]
  );

const menuLink = (
  model: PecuniaModel,
  item: (typeof menuSections)[number]["items"][number],
  h: HtmlBuilder<PecuniaMessage>
): Html => {
  const current = isCurrent(model.route, item);

  return h.a(
    [
      h.AriaCurrent(current ? "page" : "false"),
      h.Class(
        stylex.props(
          styles.navLink,
          current && styles.navLinkActive,
          styles.focus
        ).className ?? ""
      ),
      h.Href(item.path),
    ],
    [item.label]
  );
};

const sideMenu = (model: PecuniaModel, h: HtmlBuilder<PecuniaMessage>): Html =>
  h.nav(
    [h.AriaLabel("Main"), h.Class(className(styles.sidebar))],
    menuSections.map((section) =>
      h.div(
        [h.Key(section.heading), h.Class(className(styles.navSection))],
        [
          h.p([h.Class(className(styles.navHeading))], [section.heading]),
          h.ul(
            [h.Class(className(styles.navList))],
            section.items.map((item) =>
              h.li([h.Key(item.path)], [menuLink(model, item, h)])
            )
          ),
        ]
      )
    )
  );

const topbar = (model: PecuniaModel, h: HtmlBuilder<PecuniaMessage>): Html =>
  h.header(
    [h.Class(className(styles.topbar))],
    [
      h.a(
        [
          h.Class(stylex.props(styles.brand, styles.focus).className ?? ""),
          h.Href(dashboardRouter()),
        ],
        [
          h.span([h.Class(className(styles.brandMark)), h.AriaHidden(true)]),
          "Pecunia",
        ]
      ),
      h.div(
        [h.Class(className(styles.topbarEnd))],
        [
          h.p([h.Class(className(styles.profile))], ["Demo profile"]),
          themeControl(model, h),
        ]
      ),
    ]
  );

export const frame = (
  model: PecuniaModel,
  content: Html,
  h: HtmlBuilder<PecuniaMessage>
): Html =>
  h.div(
    [
      h.Class(
        stylex.props(
          styles.root,
          model.theme === "dark" ? darkPecunia : null,
          model.theme === "dark" ? layout.darkScheme : layout.lightScheme
        ).className ?? ""
      ),
      h.DataAttribute("theme", model.theme),
    ],
    [
      h.div(
        [h.Class(className(layout.bounded))],
        [
          topbar(model, h),
          h.div(
            [h.Class(className(styles.body))],
            [
              sideMenu(model, h),
              h.main([h.Class(className(styles.main))], [content]),
            ]
          ),
        ]
      ),
    ]
  );
