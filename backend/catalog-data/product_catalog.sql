--
-- PostgreSQL database dump
--

\restrict Wz3X05maCCJZUE7H5BPvshgbT0NPzDrTQC6WLZXMLR1JgC73MfoNzYsZfbFEPxb

-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('1e17537f-81a9-4478-afc8-b90211a6e3e2', 'Kobold VK7 Akku-Staubsauger & Saugwischer inkl. Upgrade-Bonus', 'Kobold', 'Kobold Deal: Saugwisch-Set für deine Hartböden inkl. Staubsauger-Aufsatz

Der VK7 Akku-Staubsauger ist Testsieger der Stiftung Warentest (veröffentlicht am 18.06.2025). *** Das Saugwisch-Set enthält:

Den leichten und kraftvollen VK7 Akku-Staubsauger,
die EB7 Elektrobürste, die sich dank der automatischen Bodenerkennung ganz genau deinen Bodenverhältnissen anpasst,
den SP7 Saugwischer, der in einem Schritt deine Hartböden (z. B. Laminat, Parkett, Fliesen, Vinyl) saugt und wischt.
 
Deine Top-Features:

Kabellos, super leise und saugstark auch bei grobem Schmutz.
Akkulaufzeit bis zu 30 Minuten staubsaugen oder bis zu 23 Minuten saugwischen (mehr Infos findest du hier, S. 33).
Mit nur 2,3 kg (Grundgerät ohne Aufsatz) ist er ein wahres Leichtgewicht und super wendig.
 
👍261,80 € Gesamtvorteil, setzt sich zusammen aus:

150,00 € Upgrade-Bonus ***
111,80 € Set-Ersparnis ***', '[]', '{}', '[]', '[]', 'https://www.vorwerk.com/de/de?_gl=1*1oooj67*_up*MQ..*_gs*MQ..&gclid=Cj0KCQjwkOvTBhDgARIsAKUNyRsSe1bCDK--9m_mLdTYUvd0PpoCjmGDL8BveR_C3Cp1AZAOLnFWB50aAkgMEALw_wcB&gclsrc=aw.ds&gbraid=0AAAAACqER8rffiCpmyo9zsiR7Wa0WXsLT', 'https://www.vorwerk.com/de/de/s/shop/kobold-vk7-akku-staubsauger-saugwischer-upgrade-bonus-de?utm_source=Google&utm_medium=SEA&utm_campaign=Paid_SEA_Shopping_Sale_Google_Vaccum-cleaners_PerformanceMax_VK7&utm_content=Google_PerformanceMax&gclsrc=aw.ds&gad_source=1&gad_campaignid=23900851898&gbraid=0AAAAACqER8rffiCpmyo9zsiR7Wa0WXsLT&gclid=Cj0KCQjwkOvTBhDgARIsAKUNyRsSe1bCDK--9m_mLdTYUvd0PpoCjmGDL8BveR_C3Cp1AZAOLnFWB50aAkgMEALw_wcB', 'manual_verified', '2026-08-11 17:19:34.111997+00', true, true, '2026-08-11 17:19:00.595288+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('4b261acf-fb8a-4961-a47c-627728b8fc42', 'Kobold VK7 Akku-Staubsauger inkl. EB7', 'Akku-Staubsauger & Sets', 'VK7 Akku-Staubsauger mit EB7 Elektrobürste. Kabelloses Bodenreinigungssystem mit automatischer Bodenerkennung.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.257957+00', true, true, '2026-08-12 08:50:51.248772+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('45e7fec5-fc6f-4e10-ab46-d0fe7b01574d', 'Kobold VK7 + SP7 Saugwischer + EB7', 'Akku-Staubsauger & Sets', 'VK7 System mit EB7 Elektrobürste und SP7 Saugwischer zum Saugen und Wischen von Hartböden in einem Arbeitsgang.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.273201+00', true, true, '2026-08-12 08:50:51.263182+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('58417f7c-60fc-4f18-8123-f2dc247f3c3b', 'Kobold VK7 + PB7 Polsterbürste + EB7', 'Akku-Staubsauger & Sets', 'VK7 System mit EB7 Elektrobürste und PB7 Polsterbürste für Böden sowie Polster- und Textilreinigung.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.276889+00', true, true, '2026-08-12 08:50:51.275467+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('b3dfc44a-f666-4ad1-8af5-b767125eff74', 'Kobold VK7 + SP7 + PB7', 'Akku-Staubsauger & Sets', 'Umfangreiches VK7 Reinigungssystem mit Saugwischer und Polsterbürste.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.281202+00', true, true, '2026-08-12 08:50:51.280106+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('76c79d07-2060-47b6-9bf4-6e97f19614f6', 'Kobold VK7 + HD7 Hartbodendüse', 'Akku-Staubsauger & Sets', 'VK7 Akku-Staubsauger als leichtes System speziell für Hartböden mit HD7 Hartbodendüse.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.285022+00', true, true, '2026-08-12 08:50:51.283886+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('113c0a41-710e-40d2-80d1-808814ccac82', 'Kobold SP7 Saugwischer Universal Basis-Set', 'Saugwischer', 'SP7 Aufsatz für das VK7 System. Saugt und wischt Hartböden gleichzeitig.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.288028+00', true, true, '2026-08-12 08:50:51.286909+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('8781fc21-3640-44d4-a719-4d12b5dfbe3c', 'Kobold SP7 Saugwischer Premium-Set', 'Saugwischer', 'SP7 Saugwischer-Set für die kombinierte Trocken- und Feuchtreinigung von Hartböden.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.290748+00', true, true, '2026-08-12 08:50:51.28971+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('c15af92c-1e65-41df-ba72-b7d27b23dd53', 'Kobold PB7 Matratzen- und Polster Set', 'Polster & Matratzen', 'PB7 System zur gründlichen Reinigung von Polstern und Matratzen.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.293152+00', true, true, '2026-08-12 08:50:51.292291+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('8dcf33f0-240e-4c20-ab86-61155cbb45c4', 'Kobold VR7 Saugroboter + RB7 Servicestation', 'Saugroboter', 'VR7 Saugroboter mit automatischer Servicestation für selbstständige Bodenreinigung und Schmutzabsaugung.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.295521+00', true, true, '2026-08-12 08:50:51.294657+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('86b0b940-f69e-4435-b31e-be14e2dd8f2d', 'Kobold VM7 Akku-Handstaubsauger', 'Akku-Handstaubsauger', 'Kompakter kabelloser Handstaubsauger für die schnelle Reinigung zwischendurch.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.297963+00', true, true, '2026-08-12 08:50:51.297063+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('beacd604-c552-4841-83ac-f269acb8a720', 'Kobold VM7 Akku-Handstaubsauger CM7 Set', 'Akku-Handstaubsauger', 'VM7 Akku-Handstaubsauger im Set mit zusätzlichem Zubehör.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.300556+00', true, true, '2026-08-12 08:50:51.299512+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('cdaf8d96-3e6a-4988-a776-f4be389a0841', 'Kobold VG100+ Flächenreiniger Komplett Set', 'Fenster & Flächen', 'Akku-Flächenreiniger für Fenster, Glas und weitere glatte Flächen.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.303448+00', true, true, '2026-08-12 08:50:51.302394+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('7f3e48c1-174a-4494-ace2-b86f5382888c', 'Kobold VT300 Bodenstaubsauger Grundgerät', 'Kabel-Staubsauger', 'Leistungsstarkes kabelgebundenes Grundgerät für verschiedene Kobold Aufsätze.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.30623+00', true, true, '2026-08-12 08:50:51.305165+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('cf20b78d-90f4-42d2-805e-00f5fafcd1a8', 'Kobold VT300 Bodenstaubsauger mit EB400', 'Kabel-Staubsauger', 'VT300 Bodenstaubsauger mit Elektrobürste für die gründliche Bodenreinigung.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.308843+00', true, true, '2026-08-12 08:50:51.307862+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('af0761a5-a85b-459d-ac5e-fcc72fef4a67', 'Kobold FP7 Premium Filtertüten Set 12 Stück', 'Verbrauchsmaterial', 'Premium Filtertüten für das Kobold VK7 System.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.313154+00', true, true, '2026-08-12 08:50:51.312055+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('54816282-d655-4219-bcd8-affb32bee786', 'Kobold BY7 Akku', 'Akkus & Ersatzteile', 'Wechselakku für das Kobold VK7 Reinigungssystem.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.315868+00', true, true, '2026-08-12 08:50:51.314983+00');
INSERT INTO public.products (id, name, category, description, functions_json, technical_json, variants_json, accessories_json, official_url, source_url, source_kind, source_updated_at, verified, active, created_at) VALUES ('5dd83b1a-b320-496c-9062-c9ddada172eb', 'Kobold AC7 Zubehör Set Box', 'Zubehör', 'Praktisches Zubehör-Set für das VK7 Reinigungssystem.', '[]', '{}', '[]', '[]', NULL, '', 'manual_verified', '2026-08-12 08:50:51.318464+00', true, true, '2026-08-12 08:50:51.317509+00');


--
-- Data for Name: product_images; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.product_images (id, product_id, url, alt_text, source_url, usage_note, fetched_at, verified) VALUES ('0270f7f9-1eed-4a8b-a230-ee64cc24c1be', '1e17537f-81a9-4478-afc8-b90211a6e3e2', 'https://media.vorwerk.com/is/image/vorwerk/KS_DE303293_b%3A1x1?fmt=png-alpha&hei=96&wid=96', NULL, 'https://www.vorwerk.com/de/de/s/shop/kobold-vk7-akku-staubsauger-saugwischer-upgrade-bonus-de', 'interne freigabe ', '2026-08-11 17:19:00.600716+00', false);
INSERT INTO public.product_images (id, product_id, url, alt_text, source_url, usage_note, fetched_at, verified) VALUES ('63dd5edd-74ff-40de-bc46-e82cf30f7ea3', '1e17537f-81a9-4478-afc8-b90211a6e3e2', 'https://media.vorwerk.com/is/image/vorwerk/KS_DE303293_b%3A1x1?fmt=png-alpha&hei=96&wid=96', NULL, 'https://www.vorwerk.com/de/de/s/shop/kobold-vk7-akku-staubsauger-saugwischer-upgrade-bonus-de', 'interne freigabe ', '2026-08-11 17:19:34.113529+00', true);


--
-- Data for Name: product_presentations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.product_presentations (id, customer_id, employee_id, appointment_id, product_id, presented_at, notes) VALUES ('848bb14c-9fe8-486c-a5da-7cd1b1b3114d', 'd87222c0-de18-4102-b1b6-fa90dd3235ed', 'de65ab90-371a-4587-8cac-d7b801969138', NULL, '1e17537f-81a9-4478-afc8-b90211a6e3e2', '2026-08-11 17:40:59.581+00', NULL);
INSERT INTO public.product_presentations (id, customer_id, employee_id, appointment_id, product_id, presented_at, notes) VALUES ('6208de2d-b4e3-48c1-b83a-a82d2a7b845e', 'd87222c0-de18-4102-b1b6-fa90dd3235ed', 'de65ab90-371a-4587-8cac-d7b801969138', NULL, '1e17537f-81a9-4478-afc8-b90211a6e3e2', '2026-08-11 17:41:52.376+00', NULL);


--
-- Data for Name: product_prices; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('83caa0b9-a74c-42e4-9e07-f07f98df8463', '1e17537f-81a9-4478-afc8-b90211a6e3e2', 134900, 'EUR', NULL, NULL, 'https://www.vorwerk.com/de/de/s/shop/kobold-vk7-akku-staubsauger-saugwischer-upgrade-bonus-de?utm_source=Google&utm_medium=SEA&utm_campaign=Paid_SEA_Shopping_Sale_Google_Vaccum-cleaners_PerformanceMax_VK7&utm_content=Google_PerformanceMax&gclsrc=aw.ds&gad_source=1&gad_campaignid=23900851898&gbraid=0AAAAACqER8rffiCpmyo9zsiR7Wa0WXsLT&gclid=Cj0KCQjwkOvTBhDgARIsAKUNyRsSe1bCDK--9m_mLdTYUvd0PpoCjmGDL8BveR_C3Cp1AZAOLnFWB50aAkgMEALw_wcB', '2026-08-11 17:19:00.604526+00', true);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('c2596c6c-d7f8-4d0a-85a7-7785b0eaabe9', '1e17537f-81a9-4478-afc8-b90211a6e3e2', 134900, 'EUR', NULL, NULL, 'https://www.vorwerk.com/de/de/s/shop/kobold-vk7-akku-staubsauger-saugwischer-upgrade-bonus-de?utm_source=Google&utm_medium=SEA&utm_campaign=Paid_SEA_Shopping_Sale_Google_Vaccum-cleaners_PerformanceMax_VK7&utm_content=Google_PerformanceMax&gclsrc=aw.ds&gad_source=1&gad_campaignid=23900851898&gbraid=0AAAAACqER8rffiCpmyo9zsiR7Wa0WXsLT&gclid=Cj0KCQjwkOvTBhDgARIsAKUNyRsSe1bCDK--9m_mLdTYUvd0PpoCjmGDL8BveR_C3Cp1AZAOLnFWB50aAkgMEALw_wcB', '2026-08-11 17:19:34.114135+00', true);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('310e1435-ec72-4aaa-b6c5-90caffb5aa28', '4b261acf-fb8a-4961-a47c-627728b8fc42', 94900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.267918+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('1e82affd-471f-4aae-bdb1-7d149adfda3a', '45e7fec5-fc6f-4e10-ab46-d0fe7b01574d', 134900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.276251+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('cd9b6d2c-07a1-4d57-8b59-84e1d260c3cb', '58417f7c-60fc-4f18-8123-f2dc247f3c3b', 114900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.280613+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('c4a93a9d-875c-413a-97bf-a81b50183ae5', 'b3dfc44a-f666-4ad1-8af5-b767125eff74', 154900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.28441+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('9ca03899-c215-4499-b4cc-032d1f0418b2', '76c79d07-2060-47b6-9bf4-6e97f19614f6', 69900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.287443+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('8524be54-07f3-429a-a850-db94da41bdec', '113c0a41-710e-40d2-80d1-808814ccac82', 49900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.290109+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('5cfa6325-fff2-4ac1-a771-03d82450493c', '8781fc21-3640-44d4-a719-4d12b5dfbe3c', 62900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.2927+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('f701d4f2-42d7-475f-ba3a-bb2d92068bac', 'c15af92c-1e65-41df-ba72-b7d27b23dd53', 39900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.295072+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('46724a64-f60d-4494-b156-28249c9eb164', '8dcf33f0-240e-4c20-ab86-61155cbb45c4', 99900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.297464+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('3202c227-3d0c-4c6c-81f1-2c6c63b6dddf', '86b0b940-f69e-4435-b31e-be14e2dd8f2d', 19900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.299939+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('d651a2b6-8702-4cb7-9bac-50ee08cca1f4', 'beacd604-c552-4841-83ac-f269acb8a720', 22900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.302851+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('573bee36-804c-4e12-a7c4-a1b8a2dc8eee', 'cdaf8d96-3e6a-4988-a776-f4be389a0841', 31900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.305589+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('352ff899-edc8-4fbc-b81f-c40f0a99e7ad', '7f3e48c1-174a-4494-ace2-b86f5382888c', 73900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.308287+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('fc7a6ed6-8ec9-4b9e-a2cf-57daf5c1dd8f', 'cf20b78d-90f4-42d2-805e-00f5fafcd1a8', 109900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.312537+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('f89b26c0-096f-4031-851c-7574e2397113', 'af0761a5-a85b-459d-ac5e-fcc72fef4a67', 3800, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.315338+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('a6965f0a-8ff8-4ebf-ba04-9a0709675b87', '54816282-d655-4219-bcd8-affb32bee786', 15900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.3179+00', false);
INSERT INTO public.product_prices (id, product_id, amount_cents, currency, valid_from, valid_to, source_url, fetched_at, verified) VALUES ('5dc0813f-1aec-4400-9982-1ecf778e4f9e', '5dd83b1a-b320-496c-9062-c9ddada172eb', 8900, 'EUR', NULL, NULL, 'manual-entry', '2026-08-12 08:50:51.319837+00', false);


--
-- PostgreSQL database dump complete
--

\unrestrict Wz3X05maCCJZUE7H5BPvshgbT0NPzDrTQC6WLZXMLR1JgC73MfoNzYsZfbFEPxb

