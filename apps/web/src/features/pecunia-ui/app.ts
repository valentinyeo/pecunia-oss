import { Command, Head, Router, UiSchema } from "@effect/ui";
import { Html, HtmlHead } from "@effect/ui/html";
import { Predicate, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import { ReadSetupQuery } from "../../client/pecunia-ui/queries.js";
import {
  navItems,
  navSections,
  PecuniaRoute,
  routeTitle,
} from "../../client/pecunia-ui/route.js";
import { CategoriesPage } from "./categories.js";
import { DashboardPage } from "./dashboard.js";
import { SettingsPage } from "./settings.js";
import { darkPecunia, layout, pecuniaUiStyles, styles, sx } from "./styles.js";
import { SubscriptionsPage } from "./subscriptions.js";
import { TransactionsPage } from "./transactions.js";

const ThemeSchema = Schema.Literals(["dark", "light"]);

export const PecuniaAppMessage = UiSchema.TaggedEnum({
  ChangedRoute: { route: PecuniaRoute },
  ClickedBackToDashboard: {},
  ClickedTheme: { theme: ThemeSchema },
  SelectedProfile: { profileId: Schema.String },
});

const laterScreen = (h: Html.H<typeof PecuniaAppMessage.Type>, title: string) =>
  h.section
    .attr("aria-label", title)
    .class(sx(styles.section))
    .children(
      h.h1.class(sx(styles.pageTitle)).children(title),
      h.p
        .attr("role", "note")
        .class(sx(styles.placeholder))
        .children(
          "This screen lands in a later slice. Its D1 capability transport is not wired yet."
        )
    );

export const PecuniaApp = Html.component({
  message: PecuniaAppMessage,
  model: Schema.Struct({
    route: PecuniaRoute,
    selectedProfileId: Schema.NullOr(Schema.String),
    theme: ThemeSchema,
  }),
  name: "PecuniaApp",
  props: Schema.Struct({
    route: PecuniaRoute,
  }),
  queries: {
    setup: {
      args: () => ({}),
      query: ReadSetupQuery,
    },
  },
}).make({
  head: () => [
    Head.titleTemplate((title) => `${title} · Pecunia`),
    HtmlHead.lang("en"),
  ],
  init: ({ props }) => ({
    route: props.route,
    selectedProfileId: null,
    theme: "light",
  }),
  subscriptions: ({ model }) => [
    Router.subscription(PecuniaRoute, model.route, (route) =>
      PecuniaAppMessage.ChangedRoute({ route })
    ),
  ],
  update: ($, message) =>
    PecuniaAppMessage.match(message, {
      ChangedRoute: ({ route }) => $.evolve({ route }),
      ClickedBackToDashboard: () =>
        $.run(
          Router.push(PecuniaRoute, PecuniaRoute.Dashboard()).pipe(
            Command.asNoop
          )
        ),
      ClickedTheme: ({ theme }) => $.evolve({ theme }),
      SelectedProfile: ({ profileId }) =>
        $.evolve({ selectedProfileId: profileId }),
    }),
  view: (h, model) => {
    const setup = AsyncResult.isSuccess(h.queries.setup)
      ? h.queries.setup.value
      : null;

    const activeProfileId =
      model.selectedProfileId ??
      setup?.setting?.primaryProfileId ??
      setup?.profiles[0]?.id ??
      "";

    const currentPath = PecuniaRoute.printPath(model.route);

    const activeScreen = PecuniaRoute.match(model.route, {
      Aliases: () => laterScreen(h, "Aliases"),
      Budgets: () => laterScreen(h, "Budgets"),
      Categories: () =>
        CategoriesPage(h, {
          key: `categories:${activeProfileId}`,
          props: { profileId: activeProfileId },
        }),
      Dashboard: () =>
        DashboardPage(h, {
          key: `dashboard:${activeProfileId}`,
          props: { profileId: activeProfileId },
        }),
      Investments: () => laterScreen(h, "Investments"),
      Merchants: () => laterScreen(h, "Merchants"),
      NotFound: () =>
        h.section
          .attr("aria-label", "Page not found")
          .class(sx(styles.section))
          .children(
            h.h1.class(sx(styles.pageTitle)).children("Page not found"),
            h.p
              .class(sx(styles.placeholder))
              .children(
                `No screen lives at ${currentPath}. Fix: open the dashboard and choose a screen from the main menu.`
              ),
            h.button
              .attr("type", "button")
              .class(sx(pecuniaUiStyles.button))
              .on("click", PecuniaAppMessage.ClickedBackToDashboard())
              .children("Back to the dashboard")
          ),
      Review: () =>
        TransactionsPage(h, {
          key: `review:${activeProfileId}`,
          props: {
            initialReview: "Awaiting",
            profileId: activeProfileId,
            title: "Review",
          },
        }),
      Rules: () => laterScreen(h, "Rules"),
      Search: () => laterScreen(h, "Search"),
      Settings: () => SettingsPage(h, { key: "settings" }),
      Subscriptions: () =>
        SubscriptionsPage(h, {
          key: `subscriptions:${activeProfileId}`,
          props: { profileId: activeProfileId },
        }),
      Transactions: () =>
        TransactionsPage(h, {
          key: `transactions:${activeProfileId}`,
          props: {
            initialReview: "Any",
            profileId: activeProfileId,
            title: "Transactions",
          },
        }),
    });

    return h.div
      .attr("data-theme", model.theme)
      .class(
        sx(
          styles.root,
          model.theme === "dark" && darkPecunia,
          model.theme === "dark" ? layout.darkScheme : layout.lightScheme
        )
      )
      .children(
        h.div.class(sx(layout.bounded)).children(
          h.header.class(sx(styles.topbar)).children(
            h.a
              .attr("href", PecuniaRoute.print(PecuniaRoute.Dashboard()))
              .class(sx(styles.brand, styles.focus))
              .children(
                h.span.attr("aria-hidden", "true").class(sx(styles.brandMark)),
                "Pecunia"
              ),
            h.div.class(sx(styles.topbarEnd)).children(
              setup !== null && setup.profiles.length > 0
                ? h.select
                    .attr("aria-label", "Active profile")
                    .class(sx(pecuniaUiStyles.profileSelect))
                    .value(activeProfileId)
                    .on("change", ({ value }) =>
                      PecuniaAppMessage.SelectedProfile({ profileId: value })
                    )
                    .children(
                      setup.profiles.map((profile) =>
                        h.option
                          .key(profile.id)
                          .attr("value", profile.id)
                          .children(`${profile.name} (${profile.baseCurrency})`)
                      )
                    )
                : h.p
                    .class(sx(styles.profile))
                    .children(routeTitle(model.route)),
              h.div
                .attr("aria-label", "Theme")
                .attr("role", "group")
                .class(sx(styles.themeGroup))
                .children(
                  (["light", "dark"] as const).map((themeOption) =>
                    h.button
                      .key(themeOption)
                      .attr("type", "button")
                      .attr("aria-pressed", String(model.theme === themeOption))
                      .class(
                        sx(
                          styles.themeButton,
                          model.theme === themeOption &&
                            styles.themeButtonActive,
                          styles.focus
                        )
                      )
                      .on(
                        "click",
                        PecuniaAppMessage.ClickedTheme({ theme: themeOption })
                      )
                      .children(themeOption === "light" ? "Light" : "Dark")
                  )
                )
            )
          ),
          h.div.class(sx(styles.body)).children(
            h.nav
              .attr("aria-label", "Main")
              .class(sx(styles.sidebar))
              .children(
                navSections.map((heading) =>
                  h.div
                    .key(heading)
                    .class(sx(styles.navSection))
                    .children(
                      h.p.class(sx(styles.navHeading)).children(heading),
                      h.ul.class(sx(styles.navList)).children(
                        navItems
                          .filter((item) => item.section === heading)
                          .map((item) => {
                            const href = PecuniaRoute.print(item.route);

                            const active = Predicate.isTagged(
                              model.route,
                              item.route._tag
                            );

                            return h.li.key(href).children(
                              h.a
                                .attr("aria-current", active ? "page" : "false")
                                .attr("href", href)
                                .class(
                                  sx(
                                    styles.navLink,
                                    active && styles.navLinkActive,
                                    styles.focus
                                  )
                                )
                                .children(item.label)
                            );
                          })
                      )
                    )
                )
              ),
            h.main.class(sx(styles.main)).children(activeScreen)
          )
        )
      );
  },
});
