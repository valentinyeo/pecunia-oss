import { Command, Head, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Option, Predicate, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import {
  ChangeSubscriptionStatusCommand,
  ListSubscriptionsQuery,
  SubscriptionFilterName,
} from "../../client/pecunia-ui/queries.js";
import { formatDay } from "../pecunia/day-format.js";
import { formatMinor } from "../pecunia/money-format.js";
import { pecuniaUiStyles, styles, sx } from "./styles.js";

const frequencyLabel = (frequency: string): string =>
  frequency.length === 0
    ? frequency
    : `${frequency[0]?.toUpperCase() ?? ""}${frequency.slice(1)}`;

export const SubscriptionsMessage = UiSchema.TaggedEnum({
  ClickedCancel: { subscriptionId: Schema.String },
  ClickedFilter: { filter: SubscriptionFilterName },
  ClickedRestore: { subscriptionId: Schema.String },
  FailedStatusChange: { message: Schema.String },
  SucceededStatusChange: { payeeName: Schema.String, statusTag: Schema.String },
});

export const SubscriptionsPage = Html.component({
  message: SubscriptionsMessage,
  model: Schema.Struct({
    feedback: Schema.NullOr(Schema.String),
    filter: SubscriptionFilterName,
  }),
  name: "SubscriptionsPage",
  props: Schema.Struct({
    profileId: Schema.String,
  }),
  queries: {
    page: {
      args: ({ model, props }) =>
        props.profileId.length === 0
          ? undefined
          : { filter: model.filter, profileId: props.profileId },
      query: ListSubscriptionsQuery,
    },
  },
}).make({
  head: () => [Head.title("Subscriptions")],
  init: () => ({ feedback: null, filter: "All" }),
  update: ($, message) =>
    SubscriptionsMessage.match(message, {
      ClickedCancel: ({ subscriptionId }) =>
        $.evolve({ feedback: null }).run(
          ChangeSubscriptionStatusCommand.make({
            action: "Cancel",
            profileId: $.props.profileId,
            subscriptionId,
          }).pipe(
            Command.match({
              onFailure: (error) =>
                SubscriptionsMessage.FailedStatusChange({
                  message: error.message,
                }),
              onSuccess: (updated) =>
                SubscriptionsMessage.SucceededStatusChange({
                  payeeName: updated.payeeName,
                  statusTag: updated.status._tag,
                }),
            })
          )
        ),
      ClickedFilter: ({ filter }) => $.evolve({ feedback: null, filter }),
      ClickedRestore: ({ subscriptionId }) =>
        $.evolve({ feedback: null }).run(
          ChangeSubscriptionStatusCommand.make({
            action: "RestoreConfirmed",
            profileId: $.props.profileId,
            subscriptionId,
          }).pipe(
            Command.match({
              onFailure: (error) =>
                SubscriptionsMessage.FailedStatusChange({
                  message: error.message,
                }),
              onSuccess: (updated) =>
                SubscriptionsMessage.SucceededStatusChange({
                  payeeName: updated.payeeName,
                  statusTag: updated.status._tag,
                }),
            })
          )
        ),
      FailedStatusChange: ({ message: text }) => $.evolve({ feedback: text }),
      SucceededStatusChange: ({ payeeName, statusTag }) =>
        $.evolve({
          feedback: `${payeeName} updated to ${statusTag} and saved to D1.`,
        }),
    }),
  view: (h, model) =>
    h.section
      .attr("aria-label", "Subscriptions")
      .class(sx(styles.section, pecuniaUiStyles.stack))
      .children(
        h.div.class(sx(pecuniaUiStyles.toolbar)).children(
          h.h1.class(sx(styles.pageTitle)).children("Subscriptions"),
          h.div
            .attr("aria-label", "Filter subscriptions")
            .attr("role", "group")
            .class(sx(pecuniaUiStyles.actionRow))
            .children(
              (["All", "Active"] as const).map((choice) =>
                h.button
                  .key(choice)
                  .attr("type", "button")
                  .attr("aria-pressed", String(model.filter === choice))
                  .class(
                    sx(
                      pecuniaUiStyles.button,
                      model.filter === choice && pecuniaUiStyles.buttonActive
                    )
                  )
                  .on(
                    "click",
                    SubscriptionsMessage.ClickedFilter({ filter: choice })
                  )
                  .children(choice)
              )
            )
        ),
        model.feedback === null
          ? null
          : h.p
              .attr("role", "status")
              .class(sx(pecuniaUiStyles.feedback))
              .children(model.feedback),
        AsyncResult.match(h.queries.page, {
          onFailure: ({ cause }) =>
            h.p
              .attr("role", "alert")
              .class(sx(pecuniaUiStyles.feedback))
              .children(`Could not load subscriptions: ${String(cause)}`),
          onInitial: () =>
            h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("Loading repeat payments…"),
          onSuccess: ({ value: page }) =>
            h.div.class(sx(pecuniaUiStyles.stack)).children(
              h.ul
                .class(sx(styles.cardGrid))
                .children(
                  h.li
                    .class(sx(styles.card))
                    .children(
                      h.span
                        .class(sx(styles.cardLabel))
                        .children("Active monthly"),
                      h.p
                        .class(sx(styles.cardValue))
                        .children(
                          formatMinor(
                            page.activeMonthly.minor,
                            page.activeMonthly.currency
                          )
                        )
                    ),
                  h.li
                    .class(sx(styles.card))
                    .children(
                      h.span
                        .class(sx(styles.cardLabel))
                        .children("Active yearly"),
                      h.p
                        .class(sx(styles.cardValue))
                        .children(
                          formatMinor(
                            page.activeAnnual.minor,
                            page.activeAnnual.currency
                          )
                        )
                    )
                ),
              page.subscriptions.length === 0
                ? h.p
                    .class(sx(pecuniaUiStyles.muted))
                    .children("No repeat payments match this filter.")
                : h.ul.class(sx(styles.accountList)).children(
                    page.subscriptions.map((sub) => {
                      const isCancelled = Predicate.isTagged(
                        sub.status,
                        "Cancelled"
                      );

                      const nextChargeText = Option.match(sub.nextCharge, {
                        onNone: () => "No upcoming charge",
                        onSome: (date) => `Next due ${formatDay(date)}`,
                      });

                      return h.li
                        .key(sub.id)
                        .class(sx(styles.accountRow))
                        .children(
                          h.div.children(
                            h.span
                              .class(sx(styles.accountName))
                              .children(sub.payeeName),
                            h.span
                              .class(sx(pecuniaUiStyles.rowMeta))
                              .children(
                                `${frequencyLabel(sub.frequency)} · ${formatMinor(sub.cost.annual.minor, sub.cost.annual.currency)} a year · ${Math.round(sub.confidence * 100)}% confidence · ${nextChargeText}`
                              )
                          ),
                          h.div.class(sx(pecuniaUiStyles.actionRow)).children(
                            h.span
                              .class(sx(pecuniaUiStyles.badge))
                              .children(sub.status._tag),
                            isCancelled
                              ? h.button
                                  .attr("type", "button")
                                  .class(sx(pecuniaUiStyles.button))
                                  .on(
                                    "click",
                                    SubscriptionsMessage.ClickedRestore({
                                      subscriptionId: sub.id,
                                    })
                                  )
                                  .children("Restore")
                              : h.button
                                  .attr("type", "button")
                                  .class(sx(pecuniaUiStyles.button))
                                  .on(
                                    "click",
                                    SubscriptionsMessage.ClickedCancel({
                                      subscriptionId: sub.id,
                                    })
                                  )
                                  .children("Cancel")
                          )
                        );
                    })
                  )
            ),
        })
      ),
});
