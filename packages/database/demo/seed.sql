INSERT INTO `profiles` (`id`, `name`, `kind`, `base_currency`, `created_at`, `archived_at`) VALUES
  ('0192f0c1-0001-702d-8484-48490b729601', 'Example Ltd', 'business', 'EUR', 1735722000000, NULL),
  ('0192f0c1-0002-7f50-85ff-5ffb4c3ef459', 'Demo Person', 'personal', 'EUR', 1735722000000, NULL);

INSERT INTO `members` (`id`, `profile_id`, `email`, `role`, `created_at`) VALUES
  ('0192f0c1-0003-71aa-8452-452301a8c3f5', '0192f0c1-0001-702d-8484-48490b729601', 'demo@example.com', 'owner', 1735722000000),
  ('0192f0c1-0004-7f41-8f2c-f2cae1eca229', '0192f0c1-0001-702d-8484-48490b729601', 'finance@example.com', 'viewer', 1735808400000),
  ('0192f0c1-0005-70cd-8633-6331f137bdc5', '0192f0c1-0002-7f50-85ff-5ffb4c3ef459', 'personal@example.com', 'owner', 1735722000000);

INSERT INTO `app_setting` (`id`, `locale`, `timezone`, `primary_profile_id`, `updated_at`) VALUES
  (1, 'en-GB', 'Europe/London', '0192f0c1-0001-702d-8484-48490b729601', 1735722000000);

INSERT INTO `provider_accounts` (`id`, `profile_id`, `provider_id`, `external_id`, `label`, `kind`, `credential_key`, `sync_start_date`, `last_synced_at`, `created_at`, `archived_at`) VALUES
  ('0192f0c1-0006-7b7b-8ffd-ffde623dd8df', '0192f0c1-0001-702d-8484-48490b729601', 'wise', 'account-demo-bank', 'Demo Bank', 'bank', 'WISE_DEMO_CREDENTIAL', '2025-01-01', 1767603600000, 1735722000000, NULL),
  ('0192f0c1-0007-7058-803d-03d3e50ee168', '0192f0c1-0001-702d-8484-48490b729601', 'trading212', 'account-demo-broker', 'Demo Broker', 'investment', 'TRADING212_DEMO_CREDENTIAL', '2025-01-01', 1767603600000, 1735722000000, NULL);

INSERT INTO `categories` (`id`, `profile_id`, `name`, `parent_id`, `color`, `spending_type`, `created_at`, `archived_at`) VALUES
  ('0192f0c1-000d-75e9-8fd7-fd7e43c901ee', '0192f0c1-0001-702d-8484-48490b729601', 'Software', NULL, 'accent', 'business', 1735722000000, NULL),
  ('0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba', '0192f0c1-0001-702d-8484-48490b729601', 'Cloud', '0192f0c1-000d-75e9-8fd7-fd7e43c901ee', 'accent', 'business', 1735722000000, NULL),
  ('0192f0c1-000f-755b-8ae4-ae47d20b52cf', '0192f0c1-0001-702d-8484-48490b729601', 'Subscriptions', NULL, 'ink', 'business', 1735722000000, NULL),
  ('0192f0c1-0010-744d-827c-27cf38c20ebb', '0192f0c1-0001-702d-8484-48490b729601', 'Travel', NULL, 'ink', 'business', 1735722000000, NULL),
  ('0192f0c1-0011-79f9-8c9a-c9af5a7eff0d', '0192f0c1-0001-702d-8484-48490b729601', 'Meals', NULL, 'ink', 'mixed', 1735722000000, NULL),
  ('0192f0c1-0012-754d-81d9-1d9489f8f6dc', '0192f0c1-0001-702d-8484-48490b729601', 'Accounting', NULL, 'ink', 'business', 1735722000000, NULL),
  ('0192f0c1-0013-703c-80e5-0e5bbe77367b', '0192f0c1-0001-702d-8484-48490b729601', 'Income', NULL, 'ink', 'business', 1735722000000, NULL),
  ('0192f0c1-0014-7dd7-87bc-7bc6a557ce75', '0192f0c1-0002-7f50-85ff-5ffb4c3ef459', 'Personal', NULL, 'ink', 'personal', 1735722000000, NULL);

INSERT INTO `payees` (`id`, `profile_id`, `name`, `normalized_name`, `kind`, `default_category_id`, `created_at`, `archived_at`) VALUES
  ('0192f0c1-0008-7e52-8fb0-fb052d752a6a', '0192f0c1-0001-702d-8484-48490b729601', 'Example Ltd', 'example-ltd', 'client', NULL, 1735722000000, NULL),
  ('0192f0c1-0009-71f7-8998-998f8330df68', '0192f0c1-0001-702d-8484-48490b729601', 'Demo Cloud Hosting', 'demo-cloud-hosting', 'merchant', NULL, 1735722000000, NULL),
  ('0192f0c1-000a-743c-890f-90fb094546ce', '0192f0c1-0001-702d-8484-48490b729601', 'Demo Coffee', 'demo-coffee', 'merchant', NULL, 1735722000000, NULL),
  ('0192f0c1-000b-7839-88f7-8f744744f3e0', '0192f0c1-0001-702d-8484-48490b729601', 'Demo Design Tool', 'demo-design-tool', 'merchant', NULL, 1735722000000, NULL),
  ('0192f0c1-000c-7d01-884e-84ef235f461f', '0192f0c1-0001-702d-8484-48490b729601', 'Demo Tax Office', 'demo-tax-office', 'tax_authority', NULL, 1735722000000, NULL);

INSERT INTO `rules` (`id`, `profile_id`, `kind`, `match_field`, `match_type`, `pattern`, `direction`, `min_amount_minor`, `max_amount_minor`, `priority`, `enabled`, `category_id`, `client_payee_id`, `counterpart_profile_id`, `obligation_kind`, `created_at`, `updated_at`) VALUES
  ('0192f0c1-0015-727a-8b92-b929ac9448a7', '0192f0c1-0001-702d-8484-48490b729601', 'categorize', 'merchant', 'contains', 'Demo Cloud Hosting', 'any', NULL, NULL, 10, 1, '0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba', NULL, NULL, NULL, 1735722000000, 1735722000000),
  ('0192f0c1-0016-7311-8199-19910f9eacd3', '0192f0c1-0001-702d-8484-48490b729601', 'self_transfer', 'description', 'contains', 'Transfer to Demo Person', 'any', NULL, NULL, 10, 1, NULL, NULL, '0192f0c1-0002-7f50-85ff-5ffb4c3ef459', NULL, 1735722000000, 1735722000000),
  ('0192f0c1-0017-72f6-81cb-1cbeb192e0d9', '0192f0c1-0001-702d-8484-48490b729601', 'refund', 'description', 'contains', 'Refund', 'any', NULL, NULL, 10, 1, NULL, NULL, NULL, NULL, 1735722000000, 1735722000000),
  ('0192f0c1-0018-7b81-8d39-d39da4c9027d', '0192f0c1-0001-702d-8484-48490b729601', 'internal_transfer', 'description', 'prefix', 'Moved', 'any', NULL, NULL, 10, 1, NULL, NULL, NULL, NULL, 1735722000000, 1735722000000),
  ('0192f0c1-0019-7c83-856a-56ab5fac0dba', '0192f0c1-0001-702d-8484-48490b729601', 'exclude', 'reference', 'digits_only', '0000', 'any', NULL, NULL, 10, 1, NULL, NULL, NULL, NULL, 1735722000000, 1735722000000),
  ('0192f0c1-001a-7537-8bd4-bd4ff9524fef', '0192f0c1-0001-702d-8484-48490b729601', 'income_client', 'merchant', 'contains', 'Example Ltd', 'in', NULL, NULL, 10, 1, NULL, '0192f0c1-0008-7e52-8fb0-fb052d752a6a', NULL, NULL, 1735722000000, 1735722000000),
  ('0192f0c1-001b-78c0-80c7-0c76dc083c34', '0192f0c1-0001-702d-8484-48490b729601', 'tax_payment', 'reference', 'contains', 'TAX', 'any', NULL, NULL, 10, 1, NULL, NULL, NULL, 'vat', 1735722000000, 1735722000000);

INSERT INTO `merchant_aliases` (`id`, `profile_id`, `payee_id`, `match_type`, `pattern`, `created_at`) VALUES
  ('0192f0c1-001c-7abd-898a-98aa573231ef', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0009-71f7-8998-998f8330df68', 'contains', 'DEMO CLOUD HOST', 1735722000000),
  ('0192f0c1-001d-76f0-8852-85205508e050', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-000a-743c-890f-90fb094546ce', 'exact', 'DEMO COFFEE', 1735722000000),
  ('0192f0c1-001e-793d-8512-512feeee7355', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-000b-7839-88f7-8f744744f3e0', 'prefix', 'DEMO DESIGN', 1735722000000),
  ('0192f0c1-001f-70e2-8760-7603b9f16842', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0008-7e52-8fb0-fb052d752a6a', 'contains', 'EXAMPLE LTD', 1735722000000);

INSERT INTO `holdings` (`id`, `profile_id`, `platform_id`, `symbol`, `name`, `asset_type`, `quantity_micros`, `cost_basis_minor`, `cost_basis_currency`, `currency`, `state`, `opened_on`, `notes`, `last_price_minor`, `last_price_currency`, `priced_at`, `created_at`, `updated_at`) VALUES
  ('0192f0c1-0020-7c24-8409-4096749fc882', '0192f0c1-0001-702d-8484-48490b729601', 'generic-broker', 'DEMO-WORLD', 'Demo World ETF', 'etf', 1500000000, 450000, 'EUR', 'EUR', 'active', '2025-02-01', '', 520000, 'EUR', 1767603600000, 1738400400000, 1767603600000),
  ('0192f0c1-0021-79a1-8066-06660e199f78', '0192f0c1-0001-702d-8484-48490b729601', 'generic-crypto-exchange', 'DEMO-BTC', 'Demo Bitcoin', 'crypto', 12000000, 600000, 'EUR', 'EUR', 'active', '2025-03-01', '', 720000, 'EUR', 1767603600000, 1740819600000, 1767603600000),
  ('0192f0c1-0022-7fa5-836b-36b4f12ac1f0', '0192f0c1-0001-702d-8484-48490b729601', 'generic-broker', 'DEMO-TECH', 'Demo Tech Stock', 'stock', 0, NULL, NULL, 'EUR', 'pending', '2025-12-01', '', NULL, NULL, NULL, 1764579600000, 1764579600000);

INSERT INTO `sync_runs` (`id`, `profile_id`, `provider_account_id`, `kind`, `state`, `chunk_index`, `window_from`, `window_to`, `imported`, `skipped`, `rejected`, `lease_owner`, `lease_expires_at`, `failure_tag`, `failure_message`, `started_at`, `finished_at`, `updated_at`) VALUES
  ('0192f0c1-0023-7be8-8311-3117b5a0e105', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'bank_sync', 'succeeded', 0, '2025-01-01', '2025-12-31', 12, 2, 1, 'worker-demo', 1767603600000, NULL, NULL, 1767603600000, 1767607200000, 1767607200000),
  ('0192f0c1-0024-7657-8fe0-fe09c3017403', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'bank_sync', 'failed', 1, '2026-01-01', '2026-01-31', 0, 0, 2, 'worker-demo', 1767690000000, 'ProviderUnauthorized', 'Demo Bank refused the demo credential.', 1767690000000, 1767693600000, 1767693600000);

INSERT INTO `sync_run_rejections` (`id`, `run_id`, `external_id`, `reason`, `detail`, `created_at`) VALUES
  ('0192f0c1-0025-7ace-823e-23e6cedc842f', '0192f0c1-0024-7657-8fe0-fe09c3017403', 'transaction-demo-unknown', 'unknown-account', 'Demo Bank returned an account id the demo book does not hold.', 1767690000000),
  ('0192f0c1-0026-7047-8885-885a6e509ddc', '0192f0c1-0024-7657-8fe0-fe09c3017403', 'transaction-demo-malformed', 'missing-currency', 'The row had no currency code, so it was quarantined.', 1767690000000);

INSERT INTO `transactions` (`id`, `profile_id`, `provider_account_id`, `external_id`, `status`, `direction`, `occurred_at`, `value_date`, `source_minor`, `source_currency`, `fee_minor`, `fee_currency`, `base_minor`, `base_currency`, `rate`, `rate_as_of`, `raw_merchant`, `raw_reference`, `raw_description`, `note`, `payee_id`, `category_id`, `categorization`, `suggestion_model`, `suggested_at`, `applied_rule_id`, `classification`, `classification_rule_id`, `client_payee_id`, `counterpart_profile_id`, `import_run_id`, `created_at`, `updated_at`) VALUES
  ('0192f0c1-0027-7c11-8261-2619d29e6868', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-01', 'posted', 'in', 1736154000000, '2025-01-06', 480000, 'EUR', NULL, NULL, 480000, 'EUR', NULL, NULL, 'Example Ltd', '', 'Invoice payment', '', '0192f0c1-0008-7e52-8fb0-fb052d752a6a', '0192f0c1-0013-703c-80e5-0e5bbe77367b', 'confirmed', NULL, NULL, NULL, 'income', '0192f0c1-001a-7537-8bd4-bd4ff9524fef', '0192f0c1-0008-7e52-8fb0-fb052d752a6a', NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1736154000000, 1736154000000),
  ('0192f0c1-0028-7018-8357-3578945c907b', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-02', 'posted', 'out', 1738573200000, '2025-02-03', 299000, 'EUR', NULL, NULL, 299000, 'EUR', NULL, NULL, 'Demo Cloud Hosting', '', 'Cloud hosting', '', '0192f0c1-0009-71f7-8998-998f8330df68', '0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba', 'applied', NULL, NULL, '0192f0c1-0015-727a-8b92-b929ac9448a7', 'none', NULL, NULL, NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1738573200000, 1738573200000),
  ('0192f0c1-0029-768c-8adb-adbefc188d19', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-03', 'posted', 'out', 1741683600000, '2025-03-11', 2999, 'USD', NULL, NULL, 2765, 'EUR', 0.922, '2025-03-11', 'Demo Design Tool', '', 'Design subscription', '', '0192f0c1-000b-7839-88f7-8f744744f3e0', '0192f0c1-000f-755b-8ae4-ae47d20b52cf', 'confirmed', NULL, NULL, NULL, 'none', NULL, NULL, NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1741683600000, 1741683600000),
  ('0192f0c1-002a-7549-8811-8111b948c159', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-04', 'posted', 'out', 1743584400000, '2025-04-02', 4250, 'EUR', 150, 'EUR', 4250, 'EUR', NULL, NULL, 'Demo Coffee', '', 'Client lunch', '', '0192f0c1-000a-743c-890f-90fb094546ce', '0192f0c1-0011-79f9-8c9a-c9af5a7eff0d', 'confirmed', NULL, NULL, NULL, 'none', NULL, NULL, NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1743584400000, 1743584400000),
  ('0192f0c1-002b-79a6-8b1a-b1ab7e790030', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-05', 'posted', 'out', 1746781200000, '2025-05-09', 12000, 'GBP', NULL, NULL, 14040, 'EUR', 1.17, '2025-05-09', 'Demo Rail', '', 'Demo Rail ticket', '', NULL, '0192f0c1-0010-744d-827c-27cf38c20ebb', 'confirmed', NULL, NULL, NULL, 'none', NULL, NULL, NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1746781200000, 1746781200000),
  ('0192f0c1-002c-7e06-8db2-db29cc906e10', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-06', 'posted', 'neutral', 1749978000000, '2025-06-15', 100000, 'EUR', NULL, NULL, 100000, 'EUR', NULL, NULL, '', '', 'Moved to Demo Savings', '', NULL, NULL, 'none', NULL, NULL, NULL, 'internal_transfer', '0192f0c1-0018-7b81-8d39-d39da4c9027d', NULL, NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1749978000000, 1749978000000),
  ('0192f0c1-002d-72a8-8fd3-fd3ae1482dc5', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-07', 'posted', 'neutral', 1751360400000, '2025-07-01', 60000, 'EUR', NULL, NULL, 60000, 'EUR', NULL, NULL, '', '', 'Transfer to Demo Person', '', NULL, NULL, 'none', NULL, NULL, NULL, 'self_transfer', '0192f0c1-0016-7311-8199-19910f9eacd3', NULL, '0192f0c1-0002-7f50-85ff-5ffb4c3ef459', '0192f0c1-0023-7be8-8311-3117b5a0e105', 1751360400000, 1751360400000),
  ('0192f0c1-002e-70b6-8abf-abfcf0a3117a', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-08', 'posted', 'out', 1754298000000, '2025-08-04', 1500, 'EUR', NULL, NULL, 1500, 'EUR', NULL, NULL, '', '0000123', 'Internal demo movement', '', NULL, NULL, 'none', NULL, NULL, NULL, 'excluded', '0192f0c1-0019-7c83-856a-56ab5fac0dba', NULL, NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1754298000000, 1754298000000),
  ('0192f0c1-002f-7574-8f47-f477afee2375', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-09', 'posted', 'out', 1756803600000, '2025-09-02', 250000, 'EUR', NULL, NULL, 250000, 'EUR', NULL, NULL, '', 'TAX-VAT-2025', 'Demo VAT payment', '', '0192f0c1-000c-7d01-884e-84ef235f461f', NULL, 'none', NULL, NULL, NULL, 'tax_payment', '0192f0c1-001b-78c0-80c7-0c76dc083c34', NULL, NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1756803600000, 1756803600000),
  ('0192f0c1-0030-7085-8d2f-d2f021323f32', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-10', 'posted', 'in', 1759741200000, '2025-10-06', 3500, 'EUR', NULL, NULL, 3500, 'EUR', NULL, NULL, '', '', 'Refund from Demo Design Tool', '', '0192f0c1-000b-7839-88f7-8f744744f3e0', NULL, 'none', NULL, NULL, NULL, 'refund', '0192f0c1-0017-72f6-81cb-1cbeb192e0d9', NULL, NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1759741200000, 1759741200000),
  ('0192f0c1-0031-7ab6-8c3b-c3bb339364f8', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-11', 'posted', 'out', 1762160400000, '2025-11-03', 8900, 'EUR', NULL, NULL, 8900, 'EUR', NULL, NULL, 'Demo Coffee', '', 'Team breakfast', '', '0192f0c1-000a-743c-890f-90fb094546ce', '0192f0c1-0011-79f9-8c9a-c9af5a7eff0d', 'suggested', 'demo-model', 1762167600000, NULL, 'none', NULL, NULL, NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1762160400000, 1762160400000),
  ('0192f0c1-0032-754e-8db8-db8922229d3c', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0006-7b7b-8ffd-ffde623dd8df', 'transaction-demo-12', 'pending', 'out', 1765184400000, '2025-12-08', 5200, 'EUR', NULL, NULL, 5200, 'EUR', NULL, NULL, 'Demo Cloud Hosting', '', 'Cloud hosting', '', '0192f0c1-0009-71f7-8998-998f8330df68', '0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba', 'confirmed', NULL, NULL, NULL, 'none', NULL, NULL, NULL, '0192f0c1-0023-7be8-8311-3117b5a0e105', 1765184400000, 1765184400000);

INSERT INTO `subscriptions` (`id`, `profile_id`, `payee_id`, `frequency`, `typical_minor`, `typical_currency`, `typical_base_minor`, `base_currency`, `confidence`, `status`, `status_changed_at`, `last_charged_on`, `next_expected_on`, `occurrence_count`, `amount_cv`, `category_id`, `notes`, `created_at`, `updated_at`) VALUES
  ('0192f0c1-0033-7362-801a-01a8162ef271', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0009-71f7-8998-998f8330df68', 'monthly', 29900, 'EUR', 29900, 'EUR', 0.96, 'confirmed', 1740819600000, '2025-12-08', '2026-01-08', 11, 0.02, '0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba', '', 1738573200000, 1765184400000),
  ('0192f0c1-0034-7407-85f0-5f03b39b14e9', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-000a-743c-890f-90fb094546ce', 'weekly', 4250, 'EUR', 4250, 'EUR', 0.61, 'cancelled', 1762333200000, '2025-10-28', '2026-01-05', 6, 0.18, '0192f0c1-0011-79f9-8c9a-c9af5a7eff0d', 'Cancelled after the demo office closed.', 1743584400000, 1762333200000);

INSERT INTO `invoice_sources` (`id`, `profile_id`, `pattern`, `vendor_payee_id`, `portal_url`, `login_hint`, `retrieval_portal`, `retrieval_email`, `retrieval_two_factor`, `retrieval_bookkeeper`, `notes`, `created_at`, `updated_at`) VALUES
  ('0192f0c1-0035-7dd0-8aba-aba363f96bd0', '0192f0c1-0001-702d-8484-48490b729601', 'Demo Design Tool', '0192f0c1-000b-7839-88f7-8f744744f3e0', 'https://portal.example.com', 'demo@example.com', 1, 1, 1, 0, 'Demo vendor portal.', 1736499600000, 1736499600000);

INSERT INTO `archive_targets` (`id`, `profile_id`, `provider`, `root_ref`, `blocklist`, `created_at`) VALUES
  ('0192f0c1-0036-72cc-8abe-abebbea44bc0', '0192f0c1-0001-702d-8484-48490b729601', 'local', 'demo-archive', '["*.tmp"]', 1736499600000);

INSERT INTO `invoice_documents` (`id`, `profile_id`, `transaction_id`, `vendor_payee_id`, `document_date`, `document_type`, `original_filename`, `r2_key`, `content_type`, `size_bytes`, `sha256`, `amount_minor`, `amount_currency`, `source`, `source_ref`, `archive_state`, `archive_target_id`, `archive_file_id`, `archived_at`, `created_at`) VALUES
  ('0192f0c1-0037-7a04-8ca7-ca71e8a2c121', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0028-7018-8357-3578945c907b', '0192f0c1-0009-71f7-8998-998f8330df68', '2025-02-03', 'invoice', 'demo-cloud-hosting-2025-02.pdf', 'documents/demo-cloud-hosting-2025-02.pdf', 'application/pdf', 24576, '4444444444444444444444444444444444444444444444444444444444444444', 299000, 'EUR', 'email', 'demo-inbox-1', 'archived', '0192f0c1-0036-72cc-8abe-abebbea44bc0', 'demo-file-1', 1738659600000, 1738659600000),
  ('0192f0c1-0038-7d36-85ce-5ceb83cb9775', '0192f0c1-0001-702d-8484-48490b729601', NULL, '0192f0c1-000b-7839-88f7-8f744744f3e0', '2025-03-11', 'receipt', 'demo-design-tool-2025-03.pdf', 'documents/demo-design-tool-2025-03.pdf', 'application/pdf', 12288, '5555555555555555555555555555555555555555555555555555555555555555', 2765, 'EUR', 'upload', NULL, 'unarchived', NULL, NULL, NULL, 1741770000000);

INSERT INTO `invoice_exceptions` (`transaction_id`, `profile_id`, `reason`, `recorded_at`) VALUES
  ('0192f0c1-002a-7549-8811-8111b948c159', '0192f0c1-0001-702d-8484-48490b729601', 'Waiting for the demo vendor receipt.', 1744189200000);

INSERT INTO `tax_profiles` (`id`, `profile_id`, `jurisdiction`, `year_start_month`, `year_start_day`, `primary`, `created_at`) VALUES
  ('0192f0c1-0039-797d-8f22-f226151d1f66', '0192f0c1-0001-702d-8484-48490b729601', 'GB', 4, 6, 1, 1735722000000);

INSERT INTO `tax_obligations` (`id`, `profile_id`, `tax_profile_id`, `kind`, `period_ends_on`, `due_on`, `label`, `amount_minor`, `amount_currency`, `status`, `settled_transaction_id`, `books_status`, `synced_at`, `created_at`) VALUES
  ('0192f0c1-003a-78a8-88e1-8e1f6757d342', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0039-797d-8f22-f226151d1f66', 'vat', '2025-09-30', '2025-11-07', 'Demo VAT quarter', 312500, 'EUR', 'estimated', NULL, 'demo-unfiled', 1759395600000, 1759395600000),
  ('0192f0c1-003b-7fc9-8357-357112be0517', '0192f0c1-0001-702d-8484-48490b729601', '0192f0c1-0039-797d-8f22-f226151d1f66', 'vat', '2025-06-30', '2025-09-02', 'Demo VAT quarter', 250000, 'EUR', 'paid', '0192f0c1-002f-7574-8f47-f477afee2375', 'demo-filed', 1751446800000, 1751446800000);

INSERT INTO `reports` (`id`, `profile_id`, `slug`, `kind`, `title`, `html`, `created_at`, `updated_at`) VALUES
  ('0192f0c1-003c-7e94-86bc-6bcede42a8db', '0192f0c1-0001-702d-8484-48490b729601', 'demo-spend-2025', 'report', 'Demo 2025 spend', '<!doctype html><html><body><h1>Demo 2025 spend</h1></body></html>', 1767603600000, 1767603600000);

INSERT INTO `exchange_rates` (`base_currency`, `quote_currency`, `as_of`, `rate`, `fetched_at`) VALUES
  ('EUR', 'USD', '2025-01-01', 1.05, 1735722000000),
  ('EUR', 'GBP', '2025-01-01', 0.845, 1735722000000),
  ('EUR', 'USD', '2025-02-01', 1.06, 1738400400000),
  ('EUR', 'GBP', '2025-02-01', 0.85, 1738400400000),
  ('EUR', 'USD', '2025-03-01', 1.07, 1740819600000),
  ('EUR', 'GBP', '2025-03-01', 0.855, 1740819600000),
  ('EUR', 'USD', '2025-04-01', 1.08, 1743498000000),
  ('EUR', 'GBP', '2025-04-01', 0.86, 1743498000000),
  ('EUR', 'USD', '2025-05-01', 1.09, 1746090000000),
  ('EUR', 'GBP', '2025-05-01', 0.865, 1746090000000),
  ('EUR', 'USD', '2025-06-01', 1.1, 1748768400000),
  ('EUR', 'GBP', '2025-06-01', 0.87, 1748768400000),
  ('EUR', 'USD', '2025-07-01', 1.11, 1751360400000),
  ('EUR', 'GBP', '2025-07-01', 0.875, 1751360400000),
  ('EUR', 'USD', '2025-08-01', 1.12, 1754038800000),
  ('EUR', 'GBP', '2025-08-01', 0.88, 1754038800000),
  ('EUR', 'USD', '2025-09-01', 1.13, 1756717200000),
  ('EUR', 'GBP', '2025-09-01', 0.885, 1756717200000),
  ('EUR', 'USD', '2025-10-01', 1.14, 1759309200000),
  ('EUR', 'GBP', '2025-10-01', 0.89, 1759309200000),
  ('EUR', 'USD', '2025-11-01', 1.15, 1761987600000),
  ('EUR', 'GBP', '2025-11-01', 0.895, 1761987600000),
  ('EUR', 'USD', '2025-12-01', 1.16, 1764579600000),
  ('EUR', 'GBP', '2025-12-01', 0.9, 1764579600000);

