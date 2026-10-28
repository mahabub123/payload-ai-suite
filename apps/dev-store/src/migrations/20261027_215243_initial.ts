import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_users_roles" AS ENUM('super-admin', 'admin', 'content', 'marketing', 'support', 'manager', 'customer');
  CREATE TYPE "public"."enum_users_preferred_locale" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_published_locale" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__posts_v_published_locale" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_faqs_topic" AS ENUM('ordering', 'payment', 'shipping', 'returns', 'products', 'account');
  CREATE TYPE "public"."enum_policies_kind" AS ENUM('shipping', 'returns', 'privacy', 'warranty', 'terms', 'payment');
  CREATE TYPE "public"."enum_policies_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__policies_v_version_kind" AS ENUM('shipping', 'returns', 'privacy', 'warranty', 'terms', 'payment');
  CREATE TYPE "public"."enum__policies_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__policies_v_published_locale" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_reviews_locale" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_reviews_status" AS ENUM('pending', 'approved', 'held');
  CREATE TYPE "public"."enum_addresses_country" AS ENUM('US', 'GB', 'CA', 'AU', 'AT', 'BE', 'BR', 'BG', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HK', 'HU', 'IN', 'IE', 'IT', 'JP', 'LV', 'LT', 'LU', 'MY', 'MT', 'MX', 'NL', 'NZ', 'NO', 'PL', 'PT', 'RO', 'SG', 'SK', 'SI', 'ES', 'SE', 'CH');
  CREATE TYPE "public"."enum_variants_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__variants_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__variants_v_published_locale" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_products_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__products_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__products_v_published_locale" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_carts_currency" AS ENUM('BDT', 'USD');
  CREATE TYPE "public"."enum_orders_status" AS ENUM('processing', 'completed', 'cancelled', 'refunded');
  CREATE TYPE "public"."enum_orders_currency" AS ENUM('BDT', 'USD');
  CREATE TYPE "public"."enum_orders_shipping_status" AS ENUM('pending', 'packed', 'shipped', 'delivered', 'returned');
  CREATE TYPE "public"."enum_transactions_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'expired', 'refunded');
  CREATE TYPE "public"."enum_transactions_currency" AS ENUM('BDT', 'USD');
  CREATE TYPE "public"."enum_ai_actions_tier" AS ENUM('confirm', 'staff');
  CREATE TYPE "public"."enum_ai_actions_status" AS ENUM('proposed', 'confirmed', 'done', 'rejected', 'failed', 'expired');
  CREATE TYPE "public"."enum_ai_prompts_task" AS ENUM('fast', 'chat', 'write', 'reason', 'embed', 'image');
  CREATE TYPE "public"."enum_ai_prompts_model_class" AS ENUM('fast', 'chat', 'write', 'reason', 'embed', 'image');
  CREATE TYPE "public"."enum_ai_prompts_status" AS ENUM('draft', 'active', 'archived');
  CREATE TYPE "public"."enum_ai_conversations_surface" AS ENUM('storefront', 'admin', 'channel', 'job');
  CREATE TYPE "public"."enum_ai_conversations_status" AS ENUM('open', 'closed', 'handed-off');
  CREATE TYPE "public"."enum_ai_messages_role" AS ENUM('user', 'assistant', 'tool', 'system');
  CREATE TYPE "public"."enum_ai_messages_feedback" AS ENUM('up', 'down');
  CREATE TYPE "public"."enum_ai_tickets_replies_channel" AS ENUM('email', 'hook');
  CREATE TYPE "public"."enum_ai_tickets_source" AS ENUM('form', 'email', 'channel', 'handoff', 'assistant');
  CREATE TYPE "public"."enum_ai_tickets_status" AS ENUM('open', 'pending', 'solved', 'closed');
  CREATE TYPE "public"."enum_ai_tickets_priority" AS ENUM('low', 'normal', 'high', 'urgent');
  CREATE TYPE "public"."enum_ai_tickets_sentiment" AS ENUM('negative', 'neutral', 'positive');
  CREATE TYPE "public"."enum_ai_providers_type" AS ENUM('openai', 'anthropic', 'google', 'azure', 'bedrock', 'mistral', 'groq', 'xai', 'deepseek', 'cohere', 'openrouter', 'openai-compatible', 'custom');
  CREATE TYPE "public"."enum_ai_providers_status" AS ENUM('unknown', 'ok', 'degraded', 'error');
  CREATE TYPE "public"."enum_ai_models_capabilities" AS ENUM('chat', 'streaming', 'tools', 'structuredOutput', 'vision', 'embeddings', 'imageGeneration', 'promptCaching', 'batch');
  CREATE TYPE "public"."enum_ai_routes_task_class" AS ENUM('fast', 'chat', 'write', 'reason', 'embed', 'image');
  CREATE TYPE "public"."enum_ai_routes_scope" AS ENUM('global', 'module', 'tenant', 'locale');
  CREATE TYPE "public"."enum_ai_usage_task" AS ENUM('fast', 'chat', 'write', 'reason', 'embed', 'image');
  CREATE TYPE "public"."enum_ai_usage_outcome" AS ENUM('ok', 'error', 'fallback', 'blocked');
  CREATE TYPE "public"."enum_ai_generations_field_type" AS ENUM('text', 'textarea', 'richText');
  CREATE TYPE "public"."enum_ai_generations_action" AS ENUM('write', 'from-photo', 'rewrite', 'shorten', 'tone', 'translate', 'seo', 'faq', 'blog', 'landing', 'attributes', 'tags', 'extract');
  CREATE TYPE "public"."enum_ai_bulk_runs_status" AS ENUM('queued', 'running', 'review', 'done', 'failed', 'cancelled');
  CREATE TYPE "public"."enum_ai_bulk_runs_action" AS ENUM('write', 'from-photo', 'rewrite', 'shorten', 'tone', 'translate', 'seo', 'faq', 'blog', 'landing', 'attributes', 'tags', 'extract');
  CREATE TYPE "public"."enum_ai_search_events_type" AS ENUM('search', 'click', 'add-to-cart', 'impression');
  CREATE TYPE "public"."enum_ai_search_events_mode" AS ENUM('hybrid', 'keyword');
  CREATE TYPE "public"."enum_ai_search_events_source" AS ENUM('storefront', 'assistant', 'api');
  CREATE TYPE "public"."enum_ai_search_reports_synonyms_status" AS ENUM('pending', 'approved', 'rejected');
  CREATE TYPE "public"."enum_ai_search_reports_missing_products_status" AS ENUM('pending', 'approved', 'rejected');
  CREATE TYPE "public"."enum_ai_recs_kind" AS ENUM('similar', 'bought-together');
  CREATE TYPE "public"."enum_ai_assistant_verifications_status" AS ENUM('pending', 'verified', 'failed', 'superseded');
  CREATE TYPE "public"."enum_ai_campaigns_kind" AS ENUM('one-off', 'abandoned-cart', 'welcome', 'win-back', 'post-purchase-review');
  CREATE TYPE "public"."enum_ai_campaigns_status" AS ENUM('draft', 'pending-approval', 'approved', 'scheduled', 'sending', 'sent', 'paused');
  CREATE TYPE "public"."enum_ai_email_drafts_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'skipped');
  CREATE TYPE "public"."enum_ai_unsubscribes_source" AS ENUM('link', 'one-click', 'manual');
  CREATE TYPE "public"."enum_ai_review_flags_label" AS ENUM('abuse', 'spam');
  CREATE TYPE "public"."enum_ai_review_flags_status" AS ENUM('flagged', 'held', 'released');
  CREATE TYPE "public"."enum_ai_channel_identities_channel" AS ENUM('whatsapp', 'messenger', 'email');
  CREATE TYPE "public"."enum_ai_channel_messages_channel" AS ENUM('whatsapp', 'messenger', 'email');
  CREATE TYPE "public"."enum_ai_channel_messages_direction" AS ENUM('in', 'out');
  CREATE TYPE "public"."enum_ai_channel_messages_status" AS ENUM('received', 'processing', 'processed', 'ignored', 'queued', 'sending', 'sent', 'skipped', 'retrying', 'failed');
  CREATE TYPE "public"."enum_ai_insight_reports_kind" AS ENUM('ask', 'briefing', 'anomaly');
  CREATE TYPE "public"."enum_ai_insight_reports_verification" AS ENUM('verified', 'corrected', 'stripped', 'computed');
  CREATE TYPE "public"."enum_ai_copilot_changesets_status" AS ENUM('proposed', 'applying', 'applied', 'discarded', 'failed');
  CREATE TYPE "public"."enum_ai_automations_steps_type" AS ENUM('classify', 'summarize', 'draft', 'extract');
  CREATE TYPE "public"."enum_ai_automations_trigger_type" AS ENUM('collection', 'schedule');
  CREATE TYPE "public"."enum_ai_automations_trigger_operation" AS ENUM('create', 'update', 'delete');
  CREATE TYPE "public"."enum_ai_automations_approval_role" AS ENUM('store-admin', 'content', 'marketing-approver', 'support', 'manager', 'super-admin');
  CREATE TYPE "public"."enum_ai_automations_action_type" AS ENUM('notify', 'create-draft', 'tag');
  CREATE TYPE "public"."enum_ai_automations_action_channel" AS ENUM('admin', 'email');
  CREATE TYPE "public"."enum_ai_automation_runs_status" AS ENUM('queued', 'running', 'awaiting-approval', 'approved', 'rejected', 'done', 'failed');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'ai-core-index-knowledge', 'ai-core-knowledge-drift', 'ai-core-retention', 'ai-content-bulk', 'ai-search-index-offering', 'ai-search-reindex', 'ai-search-learning-report', 'ai-search-recs-cooccurrence', 'ai-assistant-outcomes', 'ai-marketing-send', 'ai-marketing-segment-refresh', 'ai-marketing-sequences', 'ai-support-triage', 'ai-support-review-moderate', 'ai-support-review-insights', 'ai-channels-inbound', 'ai-channels-send', 'ai-insights-briefing', 'ai-insights-anomalies', 'ai-media-describe', 'ai-copilot-automation-run', 'ai-copilot-automation-dispatch');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'ai-core-index-knowledge', 'ai-core-knowledge-drift', 'ai-core-retention', 'ai-content-bulk', 'ai-search-index-offering', 'ai-search-reindex', 'ai-search-learning-report', 'ai-search-recs-cooccurrence', 'ai-assistant-outcomes', 'ai-marketing-send', 'ai-marketing-segment-refresh', 'ai-marketing-sequences', 'ai-support-triage', 'ai-support-review-moderate', 'ai-support-review-insights', 'ai-channels-inbound', 'ai-channels-send', 'ai-insights-briefing', 'ai-insights-anomalies', 'ai-media-describe', 'ai-copilot-automation-run', 'ai-copilot-automation-dispatch');
  CREATE TYPE "public"."enum_ai_settings_enabled_modules" AS ENUM('content', 'search', 'assistant', 'marketing', 'support', 'channels', 'insights', 'media', 'copilot');
  CREATE TYPE "public"."enum_ai_settings_budgets_per_module_module" AS ENUM('content', 'search', 'assistant', 'marketing', 'support', 'channels', 'insights', 'media', 'copilot');
  CREATE TYPE "public"."enum_ai_settings_routes_task" AS ENUM('fast', 'chat', 'write', 'reason', 'embed', 'image');
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"phone" varchar,
  	"marketing_opt_in" boolean DEFAULT false,
  	"preferred_locale" "enum_users_preferred_locale" DEFAULT 'en',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ai_generated" boolean DEFAULT false,
  	"ai_source_id" integer,
  	"ai_model" varchar,
  	"ai_operation" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar
  );
  
  CREATE TABLE "media_locales" (
  	"alt" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "media_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"parent_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories_locales" (
  	"title" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "pages_locales" (
  	"title" varchar,
  	"content" jsonb,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__pages_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_pages_v_locales" (
  	"version_title" varchar,
  	"version_content" jsonb,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"author_id" integer,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_posts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "posts_locales" (
  	"title" varchar,
  	"excerpt" varchar,
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" integer
  );
  
  CREATE TABLE "_posts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_author_id" integer,
  	"version_published_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__posts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__posts_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_posts_v_locales" (
  	"version_title" varchar,
  	"version_excerpt" varchar,
  	"version_content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_posts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"products_id" integer
  );
  
  CREATE TABLE "faqs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"topic" "enum_faqs_topic" DEFAULT 'ordering',
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "faqs_locales" (
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "policies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"kind" "enum_policies_kind",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_policies_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "policies_locales" (
  	"title" varchar,
  	"content" jsonb,
  	"summary" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_policies_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_kind" "enum__policies_v_version_kind",
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__policies_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__policies_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_policies_v_locales" (
  	"version_title" varchar,
  	"version_content" jsonb,
  	"version_summary" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "reviews" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"product_id" integer NOT NULL,
  	"customer_id" integer,
  	"author_name" varchar,
  	"rating" numeric NOT NULL,
  	"title" varchar,
  	"body" varchar NOT NULL,
  	"locale" "enum_reviews_locale" DEFAULT 'en',
  	"status" "enum_reviews_status" DEFAULT 'pending',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "addresses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"customer_id" integer,
  	"title" varchar,
  	"first_name" varchar,
  	"last_name" varchar,
  	"company" varchar,
  	"address_line1" varchar,
  	"address_line2" varchar,
  	"city" varchar,
  	"state" varchar,
  	"postal_code" varchar,
  	"country" "enum_addresses_country" NOT NULL,
  	"phone" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "variants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"product_id" integer,
  	"inventory" numeric DEFAULT 0,
  	"price_in_b_d_t_enabled" boolean,
  	"price_in_b_d_t" numeric,
  	"price_in_u_s_d_enabled" boolean,
  	"price_in_u_s_d" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "enum_variants_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "variants_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variant_options_id" integer
  );
  
  CREATE TABLE "_variants_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_product_id" integer,
  	"version_inventory" numeric DEFAULT 0,
  	"version_price_in_b_d_t_enabled" boolean,
  	"version_price_in_b_d_t" numeric,
  	"version_price_in_u_s_d_enabled" boolean,
  	"version_price_in_u_s_d" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "enum__variants_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__variants_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_variants_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"variant_options_id" integer
  );
  
  CREATE TABLE "variant_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "variant_options" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_variantoptions_options_order" varchar,
  	"variant_type_id" integer NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "products_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer
  );
  
  CREATE TABLE "products_specs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar
  );
  
  CREATE TABLE "products" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"brand" varchar,
  	"inventory" numeric DEFAULT 0,
  	"enable_variants" boolean,
  	"price_in_b_d_t_enabled" boolean,
  	"price_in_b_d_t" numeric,
  	"price_in_u_s_d_enabled" boolean,
  	"price_in_u_s_d" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "enum_products_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "products_locales" (
  	"title" varchar,
  	"description" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "products_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "products_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer,
  	"products_id" integer,
  	"variant_types_id" integer
  );
  
  CREATE TABLE "_products_v_version_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v_version_specs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_products_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_brand" varchar,
  	"version_inventory" numeric DEFAULT 0,
  	"version_enable_variants" boolean,
  	"version_price_in_b_d_t_enabled" boolean,
  	"version_price_in_b_d_t" numeric,
  	"version_price_in_u_s_d_enabled" boolean,
  	"version_price_in_u_s_d" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "enum__products_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__products_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_products_v_locales" (
  	"version_title" varchar,
  	"version_description" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_products_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_products_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer,
  	"products_id" integer,
  	"variant_types_id" integer
  );
  
  CREATE TABLE "carts_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"variant_id" integer,
  	"quantity" numeric DEFAULT 1 NOT NULL
  );
  
  CREATE TABLE "carts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"secret" varchar,
  	"customer_id" integer,
  	"purchased_at" timestamp(3) with time zone,
  	"subtotal" numeric,
  	"currency" "enum_carts_currency" DEFAULT 'BDT',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "orders_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"variant_id" integer,
  	"quantity" numeric DEFAULT 1 NOT NULL
  );
  
  CREATE TABLE "orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order_number" varchar,
  	"shipping_address_title" varchar,
  	"shipping_address_first_name" varchar,
  	"shipping_address_last_name" varchar,
  	"shipping_address_company" varchar,
  	"shipping_address_address_line1" varchar,
  	"shipping_address_address_line2" varchar,
  	"shipping_address_city" varchar,
  	"shipping_address_state" varchar,
  	"shipping_address_postal_code" varchar,
  	"shipping_address_country" varchar,
  	"shipping_address_phone" varchar,
  	"customer_id" integer,
  	"customer_email" varchar,
  	"status" "enum_orders_status" DEFAULT 'processing',
  	"amount" numeric,
  	"currency" "enum_orders_currency" DEFAULT 'BDT',
  	"shipping_status" "enum_orders_shipping_status" DEFAULT 'pending',
  	"carrier" varchar,
  	"tracking_number" varchar,
  	"estimated_delivery" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "orders_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"transactions_id" integer
  );
  
  CREATE TABLE "transactions_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"variant_id" integer,
  	"quantity" numeric DEFAULT 1 NOT NULL
  );
  
  CREATE TABLE "transactions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"billing_address_title" varchar,
  	"billing_address_first_name" varchar,
  	"billing_address_last_name" varchar,
  	"billing_address_company" varchar,
  	"billing_address_address_line1" varchar,
  	"billing_address_address_line2" varchar,
  	"billing_address_city" varchar,
  	"billing_address_state" varchar,
  	"billing_address_postal_code" varchar,
  	"billing_address_country" varchar,
  	"billing_address_phone" varchar,
  	"status" "enum_transactions_status" DEFAULT 'pending' NOT NULL,
  	"customer_id" integer,
  	"customer_email" varchar,
  	"order_id" integer,
  	"cart_id" integer,
  	"amount" numeric,
  	"currency" "enum_transactions_currency" DEFAULT 'BDT',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_actions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"summary" varchar,
  	"tool" varchar NOT NULL,
  	"tier" "enum_ai_actions_tier" NOT NULL,
  	"module" varchar,
  	"input" jsonb,
  	"status" "enum_ai_actions_status" DEFAULT 'proposed' NOT NULL,
  	"conversation_id" varchar,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"actor_kind" varchar,
  	"user_id" varchar,
  	"customer_hash" varchar,
  	"visitor_hash" varchar,
  	"channel_hash" varchar,
  	"idempotency_key" varchar,
  	"confirmed_by" jsonb,
  	"confirmed_at" timestamp(3) with time zone,
  	"result" jsonb,
  	"error" varchar,
  	"request_id" varchar,
  	"locale" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_prompts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"task" "enum_ai_prompts_task" DEFAULT 'chat' NOT NULL,
  	"locale" varchar DEFAULT '*',
  	"description" varchar,
  	"system" varchar NOT NULL,
  	"user" varchar,
  	"output_schema" jsonb,
  	"model_class" "enum_ai_prompts_model_class",
  	"version" numeric,
  	"status" "enum_ai_prompts_status" DEFAULT 'draft' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_conversations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"channel" varchar NOT NULL,
  	"module" varchar NOT NULL,
  	"surface" "enum_ai_conversations_surface",
  	"customer_hash" varchar,
  	"user_id" varchar,
  	"visitor_hash" varchar,
  	"channel_hash" varchar,
  	"status" "enum_ai_conversations_status" DEFAULT 'open',
  	"summary" varchar,
  	"summarized_up_to" numeric DEFAULT 0,
  	"handed_off" boolean DEFAULT false,
  	"outcome" varchar,
  	"message_count" numeric DEFAULT 0,
  	"last_message_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_conversations_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "ai_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"conversation_id" integer NOT NULL,
  	"seq" numeric,
  	"role" "enum_ai_messages_role" NOT NULL,
  	"text" varchar,
  	"parts" jsonb,
  	"cards" jsonb,
  	"tool_calls" jsonb,
  	"citations" jsonb,
  	"tokens" numeric,
  	"model" varchar,
  	"latency_ms" numeric,
  	"feedback" "enum_ai_messages_feedback",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_customer_memory" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"customer_hash" varchar NOT NULL,
  	"data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_tickets_replies" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"body" varchar NOT NULL,
  	"html" varchar,
  	"channel" "enum_ai_tickets_replies_channel",
  	"auto" boolean,
  	"sent_at" timestamp(3) with time zone,
  	"sent_by" varchar
  );
  
  CREATE TABLE "ai_tickets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL,
  	"source" "enum_ai_tickets_source" DEFAULT 'form' NOT NULL,
  	"status" "enum_ai_tickets_status" DEFAULT 'open' NOT NULL,
  	"priority" "enum_ai_tickets_priority" DEFAULT 'normal',
  	"assignee_id" integer,
  	"customer_id" varchar,
  	"customer_email" varchar,
  	"conversation_id" integer,
  	"transcript" jsonb,
  	"summary" varchar,
  	"topic" varchar,
  	"sentiment" "enum_ai_tickets_sentiment",
  	"language" varchar,
  	"linked_order_id" varchar,
  	"suggested_reply" varchar,
  	"triage_confidence" numeric,
  	"triaged_at" timestamp(3) with time zone,
  	"auto_answered" boolean,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_tickets_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "ai_providers_headers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "ai_providers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"provider_id" varchar NOT NULL,
  	"type" "enum_ai_providers_type" NOT NULL,
  	"base_u_r_l" varchar,
  	"key_env" varchar,
  	"encrypted_key" varchar,
  	"key_set" boolean DEFAULT false,
  	"options" jsonb,
  	"enabled" boolean DEFAULT true,
  	"status" "enum_ai_providers_status" DEFAULT 'unknown',
  	"last_health_check" timestamp(3) with time zone,
  	"last_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_models_capabilities" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_ai_models_capabilities",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "ai_models" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider_id" varchar NOT NULL,
  	"model_id" varchar NOT NULL,
  	"ref" varchar,
  	"context_window" numeric,
  	"max_output" numeric,
  	"embed_dims" numeric,
  	"input_price_micros_per_m" numeric,
  	"output_price_micros_per_m" numeric,
  	"cached_input_price_micros_per_m" numeric,
  	"image_price_micros" numeric,
  	"enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_models_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "ai_routes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"task_class" "enum_ai_routes_task_class" NOT NULL,
  	"scope" "enum_ai_routes_scope" DEFAULT 'global' NOT NULL,
  	"scope_value" varchar,
  	"timeout_ms" numeric,
  	"max_retries" numeric,
  	"enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_routes_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "ai_usage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"module" varchar,
  	"task" "enum_ai_usage_task",
  	"model" varchar,
  	"input_tokens" numeric DEFAULT 0,
  	"output_tokens" numeric DEFAULT 0,
  	"cached_input_tokens" numeric DEFAULT 0,
  	"cost_micros" numeric DEFAULT 0,
  	"latency_ms" numeric DEFAULT 0,
  	"outcome" "enum_ai_usage_outcome",
  	"error_code" varchar,
  	"prompt_slug" varchar,
  	"prompt_version" numeric,
  	"request_id" varchar,
  	"actor_kind" varchar,
  	"tenant_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_usage_daily" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"date" varchar,
  	"module" varchar,
  	"task" varchar,
  	"model" varchar,
  	"calls" numeric DEFAULT 0,
  	"errors" numeric DEFAULT 0,
  	"input_tokens" numeric DEFAULT 0,
  	"output_tokens" numeric DEFAULT 0,
  	"cached_input_tokens" numeric DEFAULT 0,
  	"cost_micros" numeric DEFAULT 0,
  	"tenant_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_audit" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"action" varchar NOT NULL,
  	"actor_kind" varchar,
  	"actor_id" varchar,
  	"actor_roles" varchar,
  	"target_collection" varchar,
  	"target_id" varchar,
  	"before" jsonb,
  	"after" jsonb,
  	"meta" jsonb,
  	"request_id" varchar,
  	"tenant_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_generations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"target_collection" varchar NOT NULL,
  	"target_id" varchar,
  	"field" varchar NOT NULL,
  	"field_type" "enum_ai_generations_field_type",
  	"locale" varchar,
  	"action" "enum_ai_generations_action" NOT NULL,
  	"prompt_slug" varchar,
  	"prompt_version" numeric,
  	"output" varchar,
  	"data" jsonb,
  	"accepted" boolean,
  	"accepted_at" timestamp(3) with time zone,
  	"decided_by" varchar,
  	"applied_at" timestamp(3) with time zone,
  	"model" varchar,
  	"cost_micros" numeric,
  	"requested_by" varchar,
  	"bulk_run_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_bulk_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"status" "enum_ai_bulk_runs_status" DEFAULT 'queued',
  	"target_collection" varchar NOT NULL,
  	"action" "enum_ai_bulk_runs_action" NOT NULL,
  	"template" varchar,
  	"fields" jsonb NOT NULL,
  	"ids" jsonb,
  	"where" jsonb,
  	"locale" varchar,
  	"instructions" varchar,
  	"tone" varchar,
  	"target_locale" varchar,
  	"total" numeric DEFAULT 0,
  	"processed" numeric DEFAULT 0,
  	"failed" numeric DEFAULT 0,
  	"error_log" jsonb,
  	"used_batch" boolean,
  	"job_id" varchar,
  	"requested_by" varchar,
  	"finished_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_search_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_ai_search_events_type" NOT NULL,
  	"search_id" varchar,
  	"query" varchar,
  	"normalized_query" varchar,
  	"filters" jsonb,
  	"result_ids" jsonb,
  	"result_count" numeric,
  	"zero_results" boolean DEFAULT false,
  	"offering_id" varchar,
  	"position" numeric,
  	"session_id" varchar,
  	"latency_ms" numeric,
  	"mode" "enum_ai_search_events_mode",
  	"source" "enum_ai_search_events_source" DEFAULT 'storefront',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_search_reports_synonyms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"term" varchar NOT NULL,
  	"synonyms" varchar NOT NULL,
  	"status" "enum_ai_search_reports_synonyms_status" DEFAULT 'pending'
  );
  
  CREATE TABLE "ai_search_reports_missing_products" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"query" varchar NOT NULL,
  	"suggestion" varchar,
  	"status" "enum_ai_search_reports_missing_products_status" DEFAULT 'pending'
  );
  
  CREATE TABLE "ai_search_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"period_start" timestamp(3) with time zone,
  	"period_end" timestamp(3) with time zone,
  	"searches" numeric,
  	"zero_result_rate" numeric,
  	"zero_result_queries" jsonb,
  	"low_click_queries" jsonb,
  	"ai_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_recs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"offering_id" varchar NOT NULL,
  	"kind" "enum_ai_recs_kind" NOT NULL,
  	"items" jsonb,
  	"computed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_assistant_verifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"conversation" varchar NOT NULL,
  	"owner" varchar NOT NULL,
  	"status" "enum_ai_assistant_verifications_status" DEFAULT 'pending',
  	"code_hash" varchar,
  	"salt" varchar,
  	"attempts" numeric DEFAULT 0,
  	"expires_at" timestamp(3) with time zone,
  	"verified_at" timestamp(3) with time zone,
  	"verified_until" timestamp(3) with time zone,
  	"customer_id" varchar,
  	"order_id" varchar,
  	"order_number_enc" varchar,
  	"email_enc" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_segments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"definition" jsonb NOT NULL,
  	"size" numeric,
  	"sample" jsonb,
  	"refreshed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_campaigns_steps_subject_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL
  );
  
  CREATE TABLE "ai_campaigns_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"delay_hours" numeric DEFAULT 0,
  	"chosen_subject" varchar,
  	"markdown" varchar,
  	"html" varchar,
  	"text" varchar,
  	"product_blocks" jsonb
  );
  
  CREATE TABLE "ai_campaigns" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_ai_campaigns_kind" DEFAULT 'one-off' NOT NULL,
  	"segment_id" integer,
  	"status" "enum_ai_campaigns_status" DEFAULT 'draft' NOT NULL,
  	"author" varchar,
  	"approved_by" varchar,
  	"approved_at" timestamp(3) with time zone,
  	"approved_hash" varchar,
  	"scheduled_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_email_drafts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"campaign_id" integer NOT NULL,
  	"step" numeric DEFAULT 0 NOT NULL,
  	"recipient_hash" varchar,
  	"email" varchar,
  	"customer_id" varchar,
  	"ref" varchar,
  	"subject" varchar,
  	"html" varchar,
  	"text" varchar,
  	"status" "enum_ai_email_drafts_status" DEFAULT 'queued' NOT NULL,
  	"idempotency_key" varchar NOT NULL,
  	"attempts" numeric DEFAULT 0,
  	"sent_at" timestamp(3) with time zone,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_unsubscribes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email_hash" varchar NOT NULL,
  	"campaign" varchar,
  	"source" "enum_ai_unsubscribes_source" DEFAULT 'link',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_review_insights" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"offering_id" varchar NOT NULL,
  	"period_start" timestamp(3) with time zone NOT NULL,
  	"period_end" timestamp(3) with time zone NOT NULL,
  	"review_count" numeric,
  	"summary" varchar,
  	"themes" jsonb,
  	"sentiment_breakdown" jsonb,
  	"flagged" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_review_flags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"review_id" varchar NOT NULL,
  	"review_collection" varchar NOT NULL,
  	"offering_id" varchar,
  	"label" "enum_ai_review_flags_label" NOT NULL,
  	"reason" varchar,
  	"confidence" numeric,
  	"held" boolean,
  	"status" "enum_ai_review_flags_status" DEFAULT 'flagged',
  	"excerpt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_channel_identities" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"channel" "enum_ai_channel_identities_channel" NOT NULL,
  	"external_id_hash" varchar NOT NULL,
  	"external_id_enc" varchar NOT NULL,
  	"customer_id" varchar,
  	"verified_at" timestamp(3) with time zone,
  	"pending_code_hash" varchar,
  	"pending_code_expires_at" timestamp(3) with time zone,
  	"pending_code_attempts" numeric,
  	"pending_customer_id" varchar,
  	"last_link_request_at" timestamp(3) with time zone,
  	"pending_actions" jsonb,
  	"last_inbound_at" timestamp(3) with time zone,
  	"conversation_id" varchar,
  	"tenant_ref" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_channel_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"channel" "enum_ai_channel_messages_channel" NOT NULL,
  	"external_message_id" varchar NOT NULL,
  	"direction" "enum_ai_channel_messages_direction" NOT NULL,
  	"status" "enum_ai_channel_messages_status" NOT NULL,
  	"identity" varchar,
  	"sender_enc" varchar,
  	"conversation_id" varchar,
  	"thread_key" varchar,
  	"reply_to" varchar,
  	"text" varchar,
  	"meta" jsonb,
  	"parts_sent" numeric,
  	"attempts" numeric,
  	"reason" varchar,
  	"error" varchar,
  	"provider_message_ids" jsonb,
  	"sent_at" timestamp(3) with time zone,
  	"tenant_ref" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_insight_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"kind" "enum_ai_insight_reports_kind" DEFAULT 'ask' NOT NULL,
  	"period_from" timestamp(3) with time zone,
  	"period_to" timestamp(3) with time zone,
  	"period_label" varchar,
  	"answer" varchar,
  	"verification" "enum_ai_insight_reports_verification",
  	"metric_calls" jsonb,
  	"charts" jsonb,
  	"flagged" jsonb,
  	"dedupe_key" varchar,
  	"emailed_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_copilot_changesets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"summary" varchar,
  	"target_collection" varchar NOT NULL,
  	"status" "enum_ai_copilot_changesets_status" DEFAULT 'proposed' NOT NULL,
  	"fields" jsonb,
  	"items" jsonb,
  	"results" jsonb,
  	"instructions" varchar,
  	"created_by" varchar,
  	"applied_by" varchar,
  	"applied_at" timestamp(3) with time zone,
  	"idempotency_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_automations_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_ai_automations_steps_type" NOT NULL,
  	"prompt_slug" varchar,
  	"instructions" varchar,
  	"output_key" varchar NOT NULL
  );
  
  CREATE TABLE "ai_automations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"trigger_type" "enum_ai_automations_trigger_type" DEFAULT 'collection' NOT NULL,
  	"trigger_collection" varchar,
  	"trigger_operation" "enum_ai_automations_trigger_operation" DEFAULT 'create',
  	"trigger_condition" jsonb,
  	"trigger_cron" varchar,
  	"approval_required" boolean DEFAULT false,
  	"approval_role" "enum_ai_automations_approval_role",
  	"action_type" "enum_ai_automations_action_type" DEFAULT 'notify' NOT NULL,
  	"action_when" jsonb,
  	"action_channel" "enum_ai_automations_action_channel" DEFAULT 'admin',
  	"action_subject" varchar,
  	"action_collection" varchar,
  	"action_field_mapping" jsonb,
  	"action_field" varchar,
  	"action_value_from" varchar,
  	"last_scheduled_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_automations_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "ai_automation_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"automation_id" integer NOT NULL,
  	"trigger_collection" varchar,
  	"trigger_doc_id" varchar,
  	"trigger_operation" varchar,
  	"status" "enum_ai_automation_runs_status" DEFAULT 'queued' NOT NULL,
  	"inputs" jsonb,
  	"outputs" jsonb,
  	"action_result" jsonb,
  	"cost_micros" numeric DEFAULT 0,
  	"error" varchar,
  	"decided_by" varchar,
  	"decided_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"meta" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"categories_id" integer,
  	"pages_id" integer,
  	"posts_id" integer,
  	"faqs_id" integer,
  	"policies_id" integer,
  	"reviews_id" integer,
  	"addresses_id" integer,
  	"variants_id" integer,
  	"variant_types_id" integer,
  	"variant_options_id" integer,
  	"products_id" integer,
  	"carts_id" integer,
  	"orders_id" integer,
  	"transactions_id" integer,
  	"ai_actions_id" integer,
  	"ai_prompts_id" integer,
  	"ai_conversations_id" integer,
  	"ai_messages_id" integer,
  	"ai_customer_memory_id" integer,
  	"ai_tickets_id" integer,
  	"ai_providers_id" integer,
  	"ai_models_id" integer,
  	"ai_routes_id" integer,
  	"ai_usage_id" integer,
  	"ai_usage_daily_id" integer,
  	"ai_audit_id" integer,
  	"ai_generations_id" integer,
  	"ai_bulk_runs_id" integer,
  	"ai_search_events_id" integer,
  	"ai_search_reports_id" integer,
  	"ai_recs_id" integer,
  	"ai_assistant_verifications_id" integer,
  	"ai_segments_id" integer,
  	"ai_campaigns_id" integer,
  	"ai_email_drafts_id" integer,
  	"ai_unsubscribes_id" integer,
  	"ai_review_insights_id" integer,
  	"ai_review_flags_id" integer,
  	"ai_channel_identities_id" integer,
  	"ai_channel_messages_id" integer,
  	"ai_insight_reports_id" integer,
  	"ai_copilot_changesets_id" integer,
  	"ai_automations_id" integer,
  	"ai_automation_runs_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ai_settings_enabled_modules" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_ai_settings_enabled_modules",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "ai_settings_budgets_per_module" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"module" "enum_ai_settings_budgets_per_module_module" NOT NULL,
  	"share" numeric,
  	"limit_micros" numeric
  );
  
  CREATE TABLE "ai_settings_routes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"task" "enum_ai_settings_routes_task" NOT NULL,
  	"timeout_ms" numeric,
  	"max_retries" numeric
  );
  
  CREATE TABLE "ai_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"brand_voice" varchar,
  	"no_training" boolean DEFAULT true,
  	"limits_visitor_per_minute" numeric DEFAULT 20,
  	"limits_visitor_per_day" numeric DEFAULT 200,
  	"limits_max_input_chars" numeric DEFAULT 2000,
  	"limits_max_output_tokens_shopper" numeric DEFAULT 400,
  	"budgets_monthly_micros" numeric DEFAULT 100000000,
  	"retention_shopper_chats_days" numeric DEFAULT 90,
  	"retention_staff_chats_days" numeric DEFAULT 365,
  	"retention_usage_days" numeric DEFAULT 730,
  	"retention_audit_days" numeric DEFAULT 1095,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "ai_settings_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_ai_source_id_media_id_fk" FOREIGN KEY ("ai_source_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_texts" ADD CONSTRAINT "media_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories_locales" ADD CONSTRAINT "categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_locales" ADD CONSTRAINT "posts_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_locales" ADD CONSTRAINT "_posts_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "faqs_locales" ADD CONSTRAINT "faqs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "policies_locales" ADD CONSTRAINT "policies_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_policies_v" ADD CONSTRAINT "_policies_v_parent_id_policies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_policies_v_locales" ADD CONSTRAINT "_policies_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_policies_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "variants_rels" ADD CONSTRAINT "variants_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "variants_rels" ADD CONSTRAINT "variants_rels_variant_options_fk" FOREIGN KEY ("variant_options_id") REFERENCES "public"."variant_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_variants_v" ADD CONSTRAINT "_variants_v_parent_id_variants_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_variants_v" ADD CONSTRAINT "_variants_v_version_product_id_products_id_fk" FOREIGN KEY ("version_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_variants_v_rels" ADD CONSTRAINT "_variants_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_variants_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_variants_v_rels" ADD CONSTRAINT "_variants_v_rels_variant_options_fk" FOREIGN KEY ("variant_options_id") REFERENCES "public"."variant_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "variant_options" ADD CONSTRAINT "variant_options_variant_type_id_variant_types_id_fk" FOREIGN KEY ("variant_type_id") REFERENCES "public"."variant_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_gallery" ADD CONSTRAINT "products_gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_gallery" ADD CONSTRAINT "products_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_specs" ADD CONSTRAINT "products_specs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_locales" ADD CONSTRAINT "products_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_texts" ADD CONSTRAINT "products_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_variant_types_fk" FOREIGN KEY ("variant_types_id") REFERENCES "public"."variant_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_gallery" ADD CONSTRAINT "_products_v_version_gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_version_gallery" ADD CONSTRAINT "_products_v_version_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_specs" ADD CONSTRAINT "_products_v_version_specs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_parent_id_products_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_locales" ADD CONSTRAINT "_products_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_texts" ADD CONSTRAINT "_products_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_variant_types_fk" FOREIGN KEY ("variant_types_id") REFERENCES "public"."variant_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "carts_items" ADD CONSTRAINT "carts_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts_items" ADD CONSTRAINT "carts_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "carts_items" ADD CONSTRAINT "carts_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_items" ADD CONSTRAINT "orders_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "orders_rels" ADD CONSTRAINT "orders_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "orders_rels" ADD CONSTRAINT "orders_rels_transactions_fk" FOREIGN KEY ("transactions_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transactions_items" ADD CONSTRAINT "transactions_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transactions_items" ADD CONSTRAINT "transactions_items_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transactions_items" ADD CONSTRAINT "transactions_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_conversations_texts" ADD CONSTRAINT "ai_conversations_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_tickets_replies" ADD CONSTRAINT "ai_tickets_replies_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_tickets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_tickets" ADD CONSTRAINT "ai_tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_tickets" ADD CONSTRAINT "ai_tickets_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_tickets_texts" ADD CONSTRAINT "ai_tickets_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ai_tickets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_providers_headers" ADD CONSTRAINT "ai_providers_headers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_models_capabilities" ADD CONSTRAINT "ai_models_capabilities_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_models_texts" ADD CONSTRAINT "ai_models_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_routes_texts" ADD CONSTRAINT "ai_routes_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ai_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_bulk_run_id_ai_bulk_runs_id_fk" FOREIGN KEY ("bulk_run_id") REFERENCES "public"."ai_bulk_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_search_reports_synonyms" ADD CONSTRAINT "ai_search_reports_synonyms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_search_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_search_reports_missing_products" ADD CONSTRAINT "ai_search_reports_missing_products_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_search_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_campaigns_steps_subject_variants" ADD CONSTRAINT "ai_campaigns_steps_subject_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_campaigns_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_campaigns_steps" ADD CONSTRAINT "ai_campaigns_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_campaigns" ADD CONSTRAINT "ai_campaigns_segment_id_ai_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."ai_segments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_email_drafts" ADD CONSTRAINT "ai_email_drafts_campaign_id_ai_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ai_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_insight_reports" ADD CONSTRAINT "ai_insight_reports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ai_automations_steps" ADD CONSTRAINT "ai_automations_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_automations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_automations_texts" ADD CONSTRAINT "ai_automations_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ai_automations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_automation_runs" ADD CONSTRAINT "ai_automation_runs_automation_id_ai_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."ai_automations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_policies_fk" FOREIGN KEY ("policies_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reviews_fk" FOREIGN KEY ("reviews_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_addresses_fk" FOREIGN KEY ("addresses_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_variants_fk" FOREIGN KEY ("variants_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_variant_types_fk" FOREIGN KEY ("variant_types_id") REFERENCES "public"."variant_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_variant_options_fk" FOREIGN KEY ("variant_options_id") REFERENCES "public"."variant_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_carts_fk" FOREIGN KEY ("carts_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_orders_fk" FOREIGN KEY ("orders_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_transactions_fk" FOREIGN KEY ("transactions_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_actions_fk" FOREIGN KEY ("ai_actions_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_prompts_fk" FOREIGN KEY ("ai_prompts_id") REFERENCES "public"."ai_prompts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_conversations_fk" FOREIGN KEY ("ai_conversations_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_messages_fk" FOREIGN KEY ("ai_messages_id") REFERENCES "public"."ai_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_customer_memory_fk" FOREIGN KEY ("ai_customer_memory_id") REFERENCES "public"."ai_customer_memory"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_tickets_fk" FOREIGN KEY ("ai_tickets_id") REFERENCES "public"."ai_tickets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_providers_fk" FOREIGN KEY ("ai_providers_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_models_fk" FOREIGN KEY ("ai_models_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_routes_fk" FOREIGN KEY ("ai_routes_id") REFERENCES "public"."ai_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_usage_fk" FOREIGN KEY ("ai_usage_id") REFERENCES "public"."ai_usage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_usage_daily_fk" FOREIGN KEY ("ai_usage_daily_id") REFERENCES "public"."ai_usage_daily"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_audit_fk" FOREIGN KEY ("ai_audit_id") REFERENCES "public"."ai_audit"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_generations_fk" FOREIGN KEY ("ai_generations_id") REFERENCES "public"."ai_generations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_bulk_runs_fk" FOREIGN KEY ("ai_bulk_runs_id") REFERENCES "public"."ai_bulk_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_search_events_fk" FOREIGN KEY ("ai_search_events_id") REFERENCES "public"."ai_search_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_search_reports_fk" FOREIGN KEY ("ai_search_reports_id") REFERENCES "public"."ai_search_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_recs_fk" FOREIGN KEY ("ai_recs_id") REFERENCES "public"."ai_recs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_assistant_verifications_fk" FOREIGN KEY ("ai_assistant_verifications_id") REFERENCES "public"."ai_assistant_verifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_segments_fk" FOREIGN KEY ("ai_segments_id") REFERENCES "public"."ai_segments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_campaigns_fk" FOREIGN KEY ("ai_campaigns_id") REFERENCES "public"."ai_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_email_drafts_fk" FOREIGN KEY ("ai_email_drafts_id") REFERENCES "public"."ai_email_drafts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_unsubscribes_fk" FOREIGN KEY ("ai_unsubscribes_id") REFERENCES "public"."ai_unsubscribes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_review_insights_fk" FOREIGN KEY ("ai_review_insights_id") REFERENCES "public"."ai_review_insights"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_review_flags_fk" FOREIGN KEY ("ai_review_flags_id") REFERENCES "public"."ai_review_flags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_channel_identities_fk" FOREIGN KEY ("ai_channel_identities_id") REFERENCES "public"."ai_channel_identities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_channel_messages_fk" FOREIGN KEY ("ai_channel_messages_id") REFERENCES "public"."ai_channel_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_insight_reports_fk" FOREIGN KEY ("ai_insight_reports_id") REFERENCES "public"."ai_insight_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_copilot_changesets_fk" FOREIGN KEY ("ai_copilot_changesets_id") REFERENCES "public"."ai_copilot_changesets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_automations_fk" FOREIGN KEY ("ai_automations_id") REFERENCES "public"."ai_automations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_automation_runs_fk" FOREIGN KEY ("ai_automation_runs_id") REFERENCES "public"."ai_automation_runs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_settings_enabled_modules" ADD CONSTRAINT "ai_settings_enabled_modules_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ai_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_settings_budgets_per_module" ADD CONSTRAINT "ai_settings_budgets_per_module_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_settings_routes" ADD CONSTRAINT "ai_settings_routes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_settings_texts" ADD CONSTRAINT "ai_settings_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ai_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_ai_source_idx" ON "media" USING btree ("ai_source_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "media_locales_parent_id_idx" ON "media_locales" USING btree ("_parent_id");
  CREATE INDEX "media_texts_order_parent" ON "media_texts" USING btree ("order","parent_id");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "categories_locales_locale_parent_id_unique" ON "categories_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "categories_locales_parent_id_idx" ON "categories_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_locales_parent_id_idx" ON "pages_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_snapshot_idx" ON "_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_locales_parent_id_idx" ON "_pages_v_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");
  CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_id");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  CREATE INDEX "posts__status_idx" ON "posts" USING btree ("_status");
  CREATE UNIQUE INDEX "posts_locales_locale_parent_id_unique" ON "posts_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "posts_locales_parent_id_idx" ON "posts_locales" USING btree ("_parent_id");
  CREATE INDEX "posts_rels_order_idx" ON "posts_rels" USING btree ("order");
  CREATE INDEX "posts_rels_parent_idx" ON "posts_rels" USING btree ("parent_id");
  CREATE INDEX "posts_rels_path_idx" ON "posts_rels" USING btree ("path");
  CREATE INDEX "posts_rels_products_id_idx" ON "posts_rels" USING btree ("products_id");
  CREATE INDEX "_posts_v_parent_idx" ON "_posts_v" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_version_slug_idx" ON "_posts_v" USING btree ("version_slug");
  CREATE INDEX "_posts_v_version_version_author_idx" ON "_posts_v" USING btree ("version_author_id");
  CREATE INDEX "_posts_v_version_version_updated_at_idx" ON "_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_posts_v_version_version_created_at_idx" ON "_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_posts_v_version_version__status_idx" ON "_posts_v" USING btree ("version__status");
  CREATE INDEX "_posts_v_created_at_idx" ON "_posts_v" USING btree ("created_at");
  CREATE INDEX "_posts_v_updated_at_idx" ON "_posts_v" USING btree ("updated_at");
  CREATE INDEX "_posts_v_snapshot_idx" ON "_posts_v" USING btree ("snapshot");
  CREATE INDEX "_posts_v_published_locale_idx" ON "_posts_v" USING btree ("published_locale");
  CREATE INDEX "_posts_v_latest_idx" ON "_posts_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_posts_v_locales_locale_parent_id_unique" ON "_posts_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_posts_v_locales_parent_id_idx" ON "_posts_v_locales" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_rels_order_idx" ON "_posts_v_rels" USING btree ("order");
  CREATE INDEX "_posts_v_rels_parent_idx" ON "_posts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_posts_v_rels_path_idx" ON "_posts_v_rels" USING btree ("path");
  CREATE INDEX "_posts_v_rels_products_id_idx" ON "_posts_v_rels" USING btree ("products_id");
  CREATE INDEX "faqs_updated_at_idx" ON "faqs" USING btree ("updated_at");
  CREATE INDEX "faqs_created_at_idx" ON "faqs" USING btree ("created_at");
  CREATE UNIQUE INDEX "faqs_locales_locale_parent_id_unique" ON "faqs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "faqs_locales_parent_id_idx" ON "faqs_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "policies_slug_idx" ON "policies" USING btree ("slug");
  CREATE INDEX "policies_updated_at_idx" ON "policies" USING btree ("updated_at");
  CREATE INDEX "policies_created_at_idx" ON "policies" USING btree ("created_at");
  CREATE INDEX "policies__status_idx" ON "policies" USING btree ("_status");
  CREATE UNIQUE INDEX "policies_locales_locale_parent_id_unique" ON "policies_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "policies_locales_parent_id_idx" ON "policies_locales" USING btree ("_parent_id");
  CREATE INDEX "_policies_v_parent_idx" ON "_policies_v" USING btree ("parent_id");
  CREATE INDEX "_policies_v_version_version_slug_idx" ON "_policies_v" USING btree ("version_slug");
  CREATE INDEX "_policies_v_version_version_updated_at_idx" ON "_policies_v" USING btree ("version_updated_at");
  CREATE INDEX "_policies_v_version_version_created_at_idx" ON "_policies_v" USING btree ("version_created_at");
  CREATE INDEX "_policies_v_version_version__status_idx" ON "_policies_v" USING btree ("version__status");
  CREATE INDEX "_policies_v_created_at_idx" ON "_policies_v" USING btree ("created_at");
  CREATE INDEX "_policies_v_updated_at_idx" ON "_policies_v" USING btree ("updated_at");
  CREATE INDEX "_policies_v_snapshot_idx" ON "_policies_v" USING btree ("snapshot");
  CREATE INDEX "_policies_v_published_locale_idx" ON "_policies_v" USING btree ("published_locale");
  CREATE INDEX "_policies_v_latest_idx" ON "_policies_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_policies_v_locales_locale_parent_id_unique" ON "_policies_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_policies_v_locales_parent_id_idx" ON "_policies_v_locales" USING btree ("_parent_id");
  CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("product_id");
  CREATE INDEX "reviews_customer_idx" ON "reviews" USING btree ("customer_id");
  CREATE INDEX "reviews_updated_at_idx" ON "reviews" USING btree ("updated_at");
  CREATE INDEX "reviews_created_at_idx" ON "reviews" USING btree ("created_at");
  CREATE INDEX "addresses_customer_idx" ON "addresses" USING btree ("customer_id");
  CREATE INDEX "addresses_updated_at_idx" ON "addresses" USING btree ("updated_at");
  CREATE INDEX "addresses_created_at_idx" ON "addresses" USING btree ("created_at");
  CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");
  CREATE INDEX "variants_updated_at_idx" ON "variants" USING btree ("updated_at");
  CREATE INDEX "variants_created_at_idx" ON "variants" USING btree ("created_at");
  CREATE INDEX "variants_deleted_at_idx" ON "variants" USING btree ("deleted_at");
  CREATE INDEX "variants__status_idx" ON "variants" USING btree ("_status");
  CREATE INDEX "variants_rels_order_idx" ON "variants_rels" USING btree ("order");
  CREATE INDEX "variants_rels_parent_idx" ON "variants_rels" USING btree ("parent_id");
  CREATE INDEX "variants_rels_path_idx" ON "variants_rels" USING btree ("path");
  CREATE INDEX "variants_rels_variant_options_id_idx" ON "variants_rels" USING btree ("variant_options_id");
  CREATE INDEX "_variants_v_parent_idx" ON "_variants_v" USING btree ("parent_id");
  CREATE INDEX "_variants_v_version_version_product_idx" ON "_variants_v" USING btree ("version_product_id");
  CREATE INDEX "_variants_v_version_version_updated_at_idx" ON "_variants_v" USING btree ("version_updated_at");
  CREATE INDEX "_variants_v_version_version_created_at_idx" ON "_variants_v" USING btree ("version_created_at");
  CREATE INDEX "_variants_v_version_version_deleted_at_idx" ON "_variants_v" USING btree ("version_deleted_at");
  CREATE INDEX "_variants_v_version_version__status_idx" ON "_variants_v" USING btree ("version__status");
  CREATE INDEX "_variants_v_created_at_idx" ON "_variants_v" USING btree ("created_at");
  CREATE INDEX "_variants_v_updated_at_idx" ON "_variants_v" USING btree ("updated_at");
  CREATE INDEX "_variants_v_snapshot_idx" ON "_variants_v" USING btree ("snapshot");
  CREATE INDEX "_variants_v_published_locale_idx" ON "_variants_v" USING btree ("published_locale");
  CREATE INDEX "_variants_v_latest_idx" ON "_variants_v" USING btree ("latest");
  CREATE INDEX "_variants_v_autosave_idx" ON "_variants_v" USING btree ("autosave");
  CREATE INDEX "_variants_v_rels_order_idx" ON "_variants_v_rels" USING btree ("order");
  CREATE INDEX "_variants_v_rels_parent_idx" ON "_variants_v_rels" USING btree ("parent_id");
  CREATE INDEX "_variants_v_rels_path_idx" ON "_variants_v_rels" USING btree ("path");
  CREATE INDEX "_variants_v_rels_variant_options_id_idx" ON "_variants_v_rels" USING btree ("variant_options_id");
  CREATE INDEX "variant_types_updated_at_idx" ON "variant_types" USING btree ("updated_at");
  CREATE INDEX "variant_types_created_at_idx" ON "variant_types" USING btree ("created_at");
  CREATE INDEX "variant_types_deleted_at_idx" ON "variant_types" USING btree ("deleted_at");
  CREATE INDEX "variant_options__variantoptions_options_order_idx" ON "variant_options" USING btree ("_variantoptions_options_order");
  CREATE INDEX "variant_options_variant_type_idx" ON "variant_options" USING btree ("variant_type_id");
  CREATE INDEX "variant_options_updated_at_idx" ON "variant_options" USING btree ("updated_at");
  CREATE INDEX "variant_options_created_at_idx" ON "variant_options" USING btree ("created_at");
  CREATE INDEX "variant_options_deleted_at_idx" ON "variant_options" USING btree ("deleted_at");
  CREATE INDEX "products_gallery_order_idx" ON "products_gallery" USING btree ("_order");
  CREATE INDEX "products_gallery_parent_id_idx" ON "products_gallery" USING btree ("_parent_id");
  CREATE INDEX "products_gallery_image_idx" ON "products_gallery" USING btree ("image_id");
  CREATE INDEX "products_specs_order_idx" ON "products_specs" USING btree ("_order");
  CREATE INDEX "products_specs_parent_id_idx" ON "products_specs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "products_deleted_at_idx" ON "products" USING btree ("deleted_at");
  CREATE INDEX "products__status_idx" ON "products" USING btree ("_status");
  CREATE UNIQUE INDEX "products_locales_locale_parent_id_unique" ON "products_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "products_locales_parent_id_idx" ON "products_locales" USING btree ("_parent_id");
  CREATE INDEX "products_texts_order_parent" ON "products_texts" USING btree ("order","parent_id");
  CREATE INDEX "products_rels_order_idx" ON "products_rels" USING btree ("order");
  CREATE INDEX "products_rels_parent_idx" ON "products_rels" USING btree ("parent_id");
  CREATE INDEX "products_rels_path_idx" ON "products_rels" USING btree ("path");
  CREATE INDEX "products_rels_categories_id_idx" ON "products_rels" USING btree ("categories_id");
  CREATE INDEX "products_rels_products_id_idx" ON "products_rels" USING btree ("products_id");
  CREATE INDEX "products_rels_variant_types_id_idx" ON "products_rels" USING btree ("variant_types_id");
  CREATE INDEX "_products_v_version_gallery_order_idx" ON "_products_v_version_gallery" USING btree ("_order");
  CREATE INDEX "_products_v_version_gallery_parent_id_idx" ON "_products_v_version_gallery" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_gallery_image_idx" ON "_products_v_version_gallery" USING btree ("image_id");
  CREATE INDEX "_products_v_version_specs_order_idx" ON "_products_v_version_specs" USING btree ("_order");
  CREATE INDEX "_products_v_version_specs_parent_id_idx" ON "_products_v_version_specs" USING btree ("_parent_id");
  CREATE INDEX "_products_v_parent_idx" ON "_products_v" USING btree ("parent_id");
  CREATE INDEX "_products_v_version_version_slug_idx" ON "_products_v" USING btree ("version_slug");
  CREATE INDEX "_products_v_version_version_updated_at_idx" ON "_products_v" USING btree ("version_updated_at");
  CREATE INDEX "_products_v_version_version_created_at_idx" ON "_products_v" USING btree ("version_created_at");
  CREATE INDEX "_products_v_version_version_deleted_at_idx" ON "_products_v" USING btree ("version_deleted_at");
  CREATE INDEX "_products_v_version_version__status_idx" ON "_products_v" USING btree ("version__status");
  CREATE INDEX "_products_v_created_at_idx" ON "_products_v" USING btree ("created_at");
  CREATE INDEX "_products_v_updated_at_idx" ON "_products_v" USING btree ("updated_at");
  CREATE INDEX "_products_v_snapshot_idx" ON "_products_v" USING btree ("snapshot");
  CREATE INDEX "_products_v_published_locale_idx" ON "_products_v" USING btree ("published_locale");
  CREATE INDEX "_products_v_latest_idx" ON "_products_v" USING btree ("latest");
  CREATE INDEX "_products_v_autosave_idx" ON "_products_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "_products_v_locales_locale_parent_id_unique" ON "_products_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_products_v_locales_parent_id_idx" ON "_products_v_locales" USING btree ("_parent_id");
  CREATE INDEX "_products_v_texts_order_parent" ON "_products_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_products_v_rels_order_idx" ON "_products_v_rels" USING btree ("order");
  CREATE INDEX "_products_v_rels_parent_idx" ON "_products_v_rels" USING btree ("parent_id");
  CREATE INDEX "_products_v_rels_path_idx" ON "_products_v_rels" USING btree ("path");
  CREATE INDEX "_products_v_rels_categories_id_idx" ON "_products_v_rels" USING btree ("categories_id");
  CREATE INDEX "_products_v_rels_products_id_idx" ON "_products_v_rels" USING btree ("products_id");
  CREATE INDEX "_products_v_rels_variant_types_id_idx" ON "_products_v_rels" USING btree ("variant_types_id");
  CREATE INDEX "carts_items_order_idx" ON "carts_items" USING btree ("_order");
  CREATE INDEX "carts_items_parent_id_idx" ON "carts_items" USING btree ("_parent_id");
  CREATE INDEX "carts_items_product_idx" ON "carts_items" USING btree ("product_id");
  CREATE INDEX "carts_items_variant_idx" ON "carts_items" USING btree ("variant_id");
  CREATE INDEX "carts_secret_idx" ON "carts" USING btree ("secret");
  CREATE INDEX "carts_customer_idx" ON "carts" USING btree ("customer_id");
  CREATE INDEX "carts_updated_at_idx" ON "carts" USING btree ("updated_at");
  CREATE INDEX "carts_created_at_idx" ON "carts" USING btree ("created_at");
  CREATE INDEX "orders_items_order_idx" ON "orders_items" USING btree ("_order");
  CREATE INDEX "orders_items_parent_id_idx" ON "orders_items" USING btree ("_parent_id");
  CREATE INDEX "orders_items_product_idx" ON "orders_items" USING btree ("product_id");
  CREATE INDEX "orders_items_variant_idx" ON "orders_items" USING btree ("variant_id");
  CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");
  CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");
  CREATE INDEX "orders_updated_at_idx" ON "orders" USING btree ("updated_at");
  CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");
  CREATE INDEX "orders_rels_order_idx" ON "orders_rels" USING btree ("order");
  CREATE INDEX "orders_rels_parent_idx" ON "orders_rels" USING btree ("parent_id");
  CREATE INDEX "orders_rels_path_idx" ON "orders_rels" USING btree ("path");
  CREATE INDEX "orders_rels_transactions_id_idx" ON "orders_rels" USING btree ("transactions_id");
  CREATE INDEX "transactions_items_order_idx" ON "transactions_items" USING btree ("_order");
  CREATE INDEX "transactions_items_parent_id_idx" ON "transactions_items" USING btree ("_parent_id");
  CREATE INDEX "transactions_items_product_idx" ON "transactions_items" USING btree ("product_id");
  CREATE INDEX "transactions_items_variant_idx" ON "transactions_items" USING btree ("variant_id");
  CREATE INDEX "transactions_customer_idx" ON "transactions" USING btree ("customer_id");
  CREATE INDEX "transactions_order_idx" ON "transactions" USING btree ("order_id");
  CREATE INDEX "transactions_cart_idx" ON "transactions" USING btree ("cart_id");
  CREATE INDEX "transactions_updated_at_idx" ON "transactions" USING btree ("updated_at");
  CREATE INDEX "transactions_created_at_idx" ON "transactions" USING btree ("created_at");
  CREATE INDEX "ai_actions_tool_idx" ON "ai_actions" USING btree ("tool");
  CREATE INDEX "ai_actions_status_idx" ON "ai_actions" USING btree ("status");
  CREATE INDEX "ai_actions_conversation_id_idx" ON "ai_actions" USING btree ("conversation_id");
  CREATE INDEX "ai_actions_user_id_idx" ON "ai_actions" USING btree ("user_id");
  CREATE INDEX "ai_actions_customer_hash_idx" ON "ai_actions" USING btree ("customer_hash");
  CREATE INDEX "ai_actions_visitor_hash_idx" ON "ai_actions" USING btree ("visitor_hash");
  CREATE INDEX "ai_actions_idempotency_key_idx" ON "ai_actions" USING btree ("idempotency_key");
  CREATE INDEX "ai_actions_updated_at_idx" ON "ai_actions" USING btree ("updated_at");
  CREATE INDEX "ai_actions_created_at_idx" ON "ai_actions" USING btree ("created_at");
  CREATE INDEX "ai_prompts_slug_idx" ON "ai_prompts" USING btree ("slug");
  CREATE INDEX "ai_prompts_locale_idx" ON "ai_prompts" USING btree ("locale");
  CREATE INDEX "ai_prompts_status_idx" ON "ai_prompts" USING btree ("status");
  CREATE INDEX "ai_prompts_updated_at_idx" ON "ai_prompts" USING btree ("updated_at");
  CREATE INDEX "ai_prompts_created_at_idx" ON "ai_prompts" USING btree ("created_at");
  CREATE INDEX "ai_conversations_channel_idx" ON "ai_conversations" USING btree ("channel");
  CREATE INDEX "ai_conversations_module_idx" ON "ai_conversations" USING btree ("module");
  CREATE INDEX "ai_conversations_surface_idx" ON "ai_conversations" USING btree ("surface");
  CREATE INDEX "ai_conversations_customer_hash_idx" ON "ai_conversations" USING btree ("customer_hash");
  CREATE INDEX "ai_conversations_user_id_idx" ON "ai_conversations" USING btree ("user_id");
  CREATE INDEX "ai_conversations_visitor_hash_idx" ON "ai_conversations" USING btree ("visitor_hash");
  CREATE INDEX "ai_conversations_channel_hash_idx" ON "ai_conversations" USING btree ("channel_hash");
  CREATE INDEX "ai_conversations_status_idx" ON "ai_conversations" USING btree ("status");
  CREATE INDEX "ai_conversations_outcome_idx" ON "ai_conversations" USING btree ("outcome");
  CREATE INDEX "ai_conversations_last_message_at_idx" ON "ai_conversations" USING btree ("last_message_at");
  CREATE INDEX "ai_conversations_updated_at_idx" ON "ai_conversations" USING btree ("updated_at");
  CREATE INDEX "ai_conversations_created_at_idx" ON "ai_conversations" USING btree ("created_at");
  CREATE INDEX "ai_conversations_texts_order_parent" ON "ai_conversations_texts" USING btree ("order","parent_id");
  CREATE INDEX "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id");
  CREATE INDEX "ai_messages_seq_idx" ON "ai_messages" USING btree ("seq");
  CREATE INDEX "ai_messages_updated_at_idx" ON "ai_messages" USING btree ("updated_at");
  CREATE INDEX "ai_messages_created_at_idx" ON "ai_messages" USING btree ("created_at");
  CREATE UNIQUE INDEX "ai_customer_memory_customer_hash_idx" ON "ai_customer_memory" USING btree ("customer_hash");
  CREATE INDEX "ai_customer_memory_updated_at_idx" ON "ai_customer_memory" USING btree ("updated_at");
  CREATE INDEX "ai_customer_memory_created_at_idx" ON "ai_customer_memory" USING btree ("created_at");
  CREATE INDEX "ai_tickets_replies_order_idx" ON "ai_tickets_replies" USING btree ("_order");
  CREATE INDEX "ai_tickets_replies_parent_id_idx" ON "ai_tickets_replies" USING btree ("_parent_id");
  CREATE INDEX "ai_tickets_source_idx" ON "ai_tickets" USING btree ("source");
  CREATE INDEX "ai_tickets_status_idx" ON "ai_tickets" USING btree ("status");
  CREATE INDEX "ai_tickets_priority_idx" ON "ai_tickets" USING btree ("priority");
  CREATE INDEX "ai_tickets_assignee_idx" ON "ai_tickets" USING btree ("assignee_id");
  CREATE INDEX "ai_tickets_customer_id_idx" ON "ai_tickets" USING btree ("customer_id");
  CREATE INDEX "ai_tickets_conversation_idx" ON "ai_tickets" USING btree ("conversation_id");
  CREATE INDEX "ai_tickets_topic_idx" ON "ai_tickets" USING btree ("topic");
  CREATE INDEX "ai_tickets_updated_at_idx" ON "ai_tickets" USING btree ("updated_at");
  CREATE INDEX "ai_tickets_created_at_idx" ON "ai_tickets" USING btree ("created_at");
  CREATE INDEX "ai_tickets_texts_order_parent" ON "ai_tickets_texts" USING btree ("order","parent_id");
  CREATE INDEX "ai_providers_headers_order_idx" ON "ai_providers_headers" USING btree ("_order");
  CREATE INDEX "ai_providers_headers_parent_id_idx" ON "ai_providers_headers" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "ai_providers_provider_id_idx" ON "ai_providers" USING btree ("provider_id");
  CREATE INDEX "ai_providers_updated_at_idx" ON "ai_providers" USING btree ("updated_at");
  CREATE INDEX "ai_providers_created_at_idx" ON "ai_providers" USING btree ("created_at");
  CREATE INDEX "ai_models_capabilities_order_idx" ON "ai_models_capabilities" USING btree ("order");
  CREATE INDEX "ai_models_capabilities_parent_idx" ON "ai_models_capabilities" USING btree ("parent_id");
  CREATE INDEX "ai_models_provider_id_idx" ON "ai_models" USING btree ("provider_id");
  CREATE UNIQUE INDEX "ai_models_ref_idx" ON "ai_models" USING btree ("ref");
  CREATE INDEX "ai_models_updated_at_idx" ON "ai_models" USING btree ("updated_at");
  CREATE INDEX "ai_models_created_at_idx" ON "ai_models" USING btree ("created_at");
  CREATE INDEX "ai_models_texts_order_parent" ON "ai_models_texts" USING btree ("order","parent_id");
  CREATE INDEX "ai_routes_updated_at_idx" ON "ai_routes" USING btree ("updated_at");
  CREATE INDEX "ai_routes_created_at_idx" ON "ai_routes" USING btree ("created_at");
  CREATE INDEX "ai_routes_texts_order_parent" ON "ai_routes_texts" USING btree ("order","parent_id");
  CREATE INDEX "ai_usage_module_idx" ON "ai_usage" USING btree ("module");
  CREATE INDEX "ai_usage_model_idx" ON "ai_usage" USING btree ("model");
  CREATE INDEX "ai_usage_outcome_idx" ON "ai_usage" USING btree ("outcome");
  CREATE INDEX "ai_usage_request_id_idx" ON "ai_usage" USING btree ("request_id");
  CREATE INDEX "ai_usage_tenant_key_idx" ON "ai_usage" USING btree ("tenant_key");
  CREATE INDEX "ai_usage_updated_at_idx" ON "ai_usage" USING btree ("updated_at");
  CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage" USING btree ("created_at");
  CREATE UNIQUE INDEX "ai_usage_daily_key_idx" ON "ai_usage_daily" USING btree ("key");
  CREATE INDEX "ai_usage_daily_date_idx" ON "ai_usage_daily" USING btree ("date");
  CREATE INDEX "ai_usage_daily_module_idx" ON "ai_usage_daily" USING btree ("module");
  CREATE INDEX "ai_usage_daily_tenant_key_idx" ON "ai_usage_daily" USING btree ("tenant_key");
  CREATE INDEX "ai_usage_daily_updated_at_idx" ON "ai_usage_daily" USING btree ("updated_at");
  CREATE INDEX "ai_usage_daily_created_at_idx" ON "ai_usage_daily" USING btree ("created_at");
  CREATE INDEX "ai_audit_action_idx" ON "ai_audit" USING btree ("action");
  CREATE INDEX "ai_audit_actor_id_idx" ON "ai_audit" USING btree ("actor_id");
  CREATE INDEX "ai_audit_target_collection_idx" ON "ai_audit" USING btree ("target_collection");
  CREATE INDEX "ai_audit_target_id_idx" ON "ai_audit" USING btree ("target_id");
  CREATE INDEX "ai_audit_request_id_idx" ON "ai_audit" USING btree ("request_id");
  CREATE INDEX "ai_audit_tenant_key_idx" ON "ai_audit" USING btree ("tenant_key");
  CREATE INDEX "ai_audit_updated_at_idx" ON "ai_audit" USING btree ("updated_at");
  CREATE INDEX "ai_audit_created_at_idx" ON "ai_audit" USING btree ("created_at");
  CREATE INDEX "ai_generations_target_collection_idx" ON "ai_generations" USING btree ("target_collection");
  CREATE INDEX "ai_generations_target_id_idx" ON "ai_generations" USING btree ("target_id");
  CREATE INDEX "ai_generations_action_idx" ON "ai_generations" USING btree ("action");
  CREATE INDEX "ai_generations_accepted_idx" ON "ai_generations" USING btree ("accepted");
  CREATE INDEX "ai_generations_bulk_run_idx" ON "ai_generations" USING btree ("bulk_run_id");
  CREATE INDEX "ai_generations_updated_at_idx" ON "ai_generations" USING btree ("updated_at");
  CREATE INDEX "ai_generations_created_at_idx" ON "ai_generations" USING btree ("created_at");
  CREATE INDEX "ai_bulk_runs_status_idx" ON "ai_bulk_runs" USING btree ("status");
  CREATE INDEX "ai_bulk_runs_updated_at_idx" ON "ai_bulk_runs" USING btree ("updated_at");
  CREATE INDEX "ai_bulk_runs_created_at_idx" ON "ai_bulk_runs" USING btree ("created_at");
  CREATE INDEX "ai_search_events_type_idx" ON "ai_search_events" USING btree ("type");
  CREATE INDEX "ai_search_events_search_id_idx" ON "ai_search_events" USING btree ("search_id");
  CREATE INDEX "ai_search_events_normalized_query_idx" ON "ai_search_events" USING btree ("normalized_query");
  CREATE INDEX "ai_search_events_zero_results_idx" ON "ai_search_events" USING btree ("zero_results");
  CREATE INDEX "ai_search_events_offering_id_idx" ON "ai_search_events" USING btree ("offering_id");
  CREATE INDEX "ai_search_events_session_id_idx" ON "ai_search_events" USING btree ("session_id");
  CREATE INDEX "ai_search_events_updated_at_idx" ON "ai_search_events" USING btree ("updated_at");
  CREATE INDEX "ai_search_events_created_at_idx" ON "ai_search_events" USING btree ("created_at");
  CREATE INDEX "ai_search_reports_synonyms_order_idx" ON "ai_search_reports_synonyms" USING btree ("_order");
  CREATE INDEX "ai_search_reports_synonyms_parent_id_idx" ON "ai_search_reports_synonyms" USING btree ("_parent_id");
  CREATE INDEX "ai_search_reports_missing_products_order_idx" ON "ai_search_reports_missing_products" USING btree ("_order");
  CREATE INDEX "ai_search_reports_missing_products_parent_id_idx" ON "ai_search_reports_missing_products" USING btree ("_parent_id");
  CREATE INDEX "ai_search_reports_updated_at_idx" ON "ai_search_reports" USING btree ("updated_at");
  CREATE INDEX "ai_search_reports_created_at_idx" ON "ai_search_reports" USING btree ("created_at");
  CREATE INDEX "ai_recs_offering_id_idx" ON "ai_recs" USING btree ("offering_id");
  CREATE INDEX "ai_recs_kind_idx" ON "ai_recs" USING btree ("kind");
  CREATE INDEX "ai_recs_updated_at_idx" ON "ai_recs" USING btree ("updated_at");
  CREATE INDEX "ai_recs_created_at_idx" ON "ai_recs" USING btree ("created_at");
  CREATE INDEX "ai_assistant_verifications_conversation_idx" ON "ai_assistant_verifications" USING btree ("conversation");
  CREATE INDEX "ai_assistant_verifications_owner_idx" ON "ai_assistant_verifications" USING btree ("owner");
  CREATE INDEX "ai_assistant_verifications_status_idx" ON "ai_assistant_verifications" USING btree ("status");
  CREATE INDEX "ai_assistant_verifications_verified_until_idx" ON "ai_assistant_verifications" USING btree ("verified_until");
  CREATE INDEX "ai_assistant_verifications_updated_at_idx" ON "ai_assistant_verifications" USING btree ("updated_at");
  CREATE INDEX "ai_assistant_verifications_created_at_idx" ON "ai_assistant_verifications" USING btree ("created_at");
  CREATE INDEX "ai_segments_updated_at_idx" ON "ai_segments" USING btree ("updated_at");
  CREATE INDEX "ai_segments_created_at_idx" ON "ai_segments" USING btree ("created_at");
  CREATE INDEX "ai_campaigns_steps_subject_variants_order_idx" ON "ai_campaigns_steps_subject_variants" USING btree ("_order");
  CREATE INDEX "ai_campaigns_steps_subject_variants_parent_id_idx" ON "ai_campaigns_steps_subject_variants" USING btree ("_parent_id");
  CREATE INDEX "ai_campaigns_steps_order_idx" ON "ai_campaigns_steps" USING btree ("_order");
  CREATE INDEX "ai_campaigns_steps_parent_id_idx" ON "ai_campaigns_steps" USING btree ("_parent_id");
  CREATE INDEX "ai_campaigns_segment_idx" ON "ai_campaigns" USING btree ("segment_id");
  CREATE INDEX "ai_campaigns_updated_at_idx" ON "ai_campaigns" USING btree ("updated_at");
  CREATE INDEX "ai_campaigns_created_at_idx" ON "ai_campaigns" USING btree ("created_at");
  CREATE INDEX "ai_email_drafts_campaign_idx" ON "ai_email_drafts" USING btree ("campaign_id");
  CREATE INDEX "ai_email_drafts_recipient_hash_idx" ON "ai_email_drafts" USING btree ("recipient_hash");
  CREATE INDEX "ai_email_drafts_status_idx" ON "ai_email_drafts" USING btree ("status");
  CREATE UNIQUE INDEX "ai_email_drafts_idempotency_key_idx" ON "ai_email_drafts" USING btree ("idempotency_key");
  CREATE INDEX "ai_email_drafts_sent_at_idx" ON "ai_email_drafts" USING btree ("sent_at");
  CREATE INDEX "ai_email_drafts_updated_at_idx" ON "ai_email_drafts" USING btree ("updated_at");
  CREATE INDEX "ai_email_drafts_created_at_idx" ON "ai_email_drafts" USING btree ("created_at");
  CREATE UNIQUE INDEX "ai_unsubscribes_email_hash_idx" ON "ai_unsubscribes" USING btree ("email_hash");
  CREATE INDEX "ai_unsubscribes_updated_at_idx" ON "ai_unsubscribes" USING btree ("updated_at");
  CREATE INDEX "ai_unsubscribes_created_at_idx" ON "ai_unsubscribes" USING btree ("created_at");
  CREATE INDEX "ai_review_insights_offering_id_idx" ON "ai_review_insights" USING btree ("offering_id");
  CREATE INDEX "ai_review_insights_period_start_idx" ON "ai_review_insights" USING btree ("period_start");
  CREATE INDEX "ai_review_insights_updated_at_idx" ON "ai_review_insights" USING btree ("updated_at");
  CREATE INDEX "ai_review_insights_created_at_idx" ON "ai_review_insights" USING btree ("created_at");
  CREATE INDEX "ai_review_flags_review_id_idx" ON "ai_review_flags" USING btree ("review_id");
  CREATE INDEX "ai_review_flags_offering_id_idx" ON "ai_review_flags" USING btree ("offering_id");
  CREATE INDEX "ai_review_flags_status_idx" ON "ai_review_flags" USING btree ("status");
  CREATE INDEX "ai_review_flags_updated_at_idx" ON "ai_review_flags" USING btree ("updated_at");
  CREATE INDEX "ai_review_flags_created_at_idx" ON "ai_review_flags" USING btree ("created_at");
  CREATE INDEX "ai_channel_identities_channel_idx" ON "ai_channel_identities" USING btree ("channel");
  CREATE INDEX "ai_channel_identities_external_id_hash_idx" ON "ai_channel_identities" USING btree ("external_id_hash");
  CREATE INDEX "ai_channel_identities_customer_id_idx" ON "ai_channel_identities" USING btree ("customer_id");
  CREATE INDEX "ai_channel_identities_updated_at_idx" ON "ai_channel_identities" USING btree ("updated_at");
  CREATE INDEX "ai_channel_identities_created_at_idx" ON "ai_channel_identities" USING btree ("created_at");
  CREATE UNIQUE INDEX "channel_externalIdHash_idx" ON "ai_channel_identities" USING btree ("channel","external_id_hash");
  CREATE INDEX "ai_channel_messages_channel_idx" ON "ai_channel_messages" USING btree ("channel");
  CREATE INDEX "ai_channel_messages_external_message_id_idx" ON "ai_channel_messages" USING btree ("external_message_id");
  CREATE INDEX "ai_channel_messages_status_idx" ON "ai_channel_messages" USING btree ("status");
  CREATE INDEX "ai_channel_messages_identity_idx" ON "ai_channel_messages" USING btree ("identity");
  CREATE INDEX "ai_channel_messages_conversation_id_idx" ON "ai_channel_messages" USING btree ("conversation_id");
  CREATE INDEX "ai_channel_messages_thread_key_idx" ON "ai_channel_messages" USING btree ("thread_key");
  CREATE INDEX "ai_channel_messages_updated_at_idx" ON "ai_channel_messages" USING btree ("updated_at");
  CREATE INDEX "ai_channel_messages_created_at_idx" ON "ai_channel_messages" USING btree ("created_at");
  CREATE UNIQUE INDEX "channel_externalMessageId_idx" ON "ai_channel_messages" USING btree ("channel","external_message_id");
  CREATE INDEX "ai_insight_reports_kind_idx" ON "ai_insight_reports" USING btree ("kind");
  CREATE INDEX "ai_insight_reports_dedupe_key_idx" ON "ai_insight_reports" USING btree ("dedupe_key");
  CREATE INDEX "ai_insight_reports_created_by_idx" ON "ai_insight_reports" USING btree ("created_by_id");
  CREATE INDEX "ai_insight_reports_updated_at_idx" ON "ai_insight_reports" USING btree ("updated_at");
  CREATE INDEX "ai_insight_reports_created_at_idx" ON "ai_insight_reports" USING btree ("created_at");
  CREATE INDEX "ai_copilot_changesets_target_collection_idx" ON "ai_copilot_changesets" USING btree ("target_collection");
  CREATE INDEX "ai_copilot_changesets_status_idx" ON "ai_copilot_changesets" USING btree ("status");
  CREATE INDEX "ai_copilot_changesets_idempotency_key_idx" ON "ai_copilot_changesets" USING btree ("idempotency_key");
  CREATE INDEX "ai_copilot_changesets_updated_at_idx" ON "ai_copilot_changesets" USING btree ("updated_at");
  CREATE INDEX "ai_copilot_changesets_created_at_idx" ON "ai_copilot_changesets" USING btree ("created_at");
  CREATE INDEX "ai_automations_steps_order_idx" ON "ai_automations_steps" USING btree ("_order");
  CREATE INDEX "ai_automations_steps_parent_id_idx" ON "ai_automations_steps" USING btree ("_parent_id");
  CREATE INDEX "ai_automations_enabled_idx" ON "ai_automations" USING btree ("enabled");
  CREATE INDEX "ai_automations_updated_at_idx" ON "ai_automations" USING btree ("updated_at");
  CREATE INDEX "ai_automations_created_at_idx" ON "ai_automations" USING btree ("created_at");
  CREATE INDEX "ai_automations_texts_order_parent" ON "ai_automations_texts" USING btree ("order","parent_id");
  CREATE INDEX "ai_automation_runs_automation_idx" ON "ai_automation_runs" USING btree ("automation_id");
  CREATE INDEX "ai_automation_runs_trigger_doc_id_idx" ON "ai_automation_runs" USING btree ("trigger_doc_id");
  CREATE INDEX "ai_automation_runs_status_idx" ON "ai_automation_runs" USING btree ("status");
  CREATE INDEX "ai_automation_runs_updated_at_idx" ON "ai_automation_runs" USING btree ("updated_at");
  CREATE INDEX "ai_automation_runs_created_at_idx" ON "ai_automation_runs" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_faqs_id_idx" ON "payload_locked_documents_rels" USING btree ("faqs_id");
  CREATE INDEX "payload_locked_documents_rels_policies_id_idx" ON "payload_locked_documents_rels" USING btree ("policies_id");
  CREATE INDEX "payload_locked_documents_rels_reviews_id_idx" ON "payload_locked_documents_rels" USING btree ("reviews_id");
  CREATE INDEX "payload_locked_documents_rels_addresses_id_idx" ON "payload_locked_documents_rels" USING btree ("addresses_id");
  CREATE INDEX "payload_locked_documents_rels_variants_id_idx" ON "payload_locked_documents_rels" USING btree ("variants_id");
  CREATE INDEX "payload_locked_documents_rels_variant_types_id_idx" ON "payload_locked_documents_rels" USING btree ("variant_types_id");
  CREATE INDEX "payload_locked_documents_rels_variant_options_id_idx" ON "payload_locked_documents_rels" USING btree ("variant_options_id");
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_carts_id_idx" ON "payload_locked_documents_rels" USING btree ("carts_id");
  CREATE INDEX "payload_locked_documents_rels_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("orders_id");
  CREATE INDEX "payload_locked_documents_rels_transactions_id_idx" ON "payload_locked_documents_rels" USING btree ("transactions_id");
  CREATE INDEX "payload_locked_documents_rels_ai_actions_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_actions_id");
  CREATE INDEX "payload_locked_documents_rels_ai_prompts_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_prompts_id");
  CREATE INDEX "payload_locked_documents_rels_ai_conversations_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_conversations_id");
  CREATE INDEX "payload_locked_documents_rels_ai_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_messages_id");
  CREATE INDEX "payload_locked_documents_rels_ai_customer_memory_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_customer_memory_id");
  CREATE INDEX "payload_locked_documents_rels_ai_tickets_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_tickets_id");
  CREATE INDEX "payload_locked_documents_rels_ai_providers_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_providers_id");
  CREATE INDEX "payload_locked_documents_rels_ai_models_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_models_id");
  CREATE INDEX "payload_locked_documents_rels_ai_routes_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_routes_id");
  CREATE INDEX "payload_locked_documents_rels_ai_usage_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_usage_id");
  CREATE INDEX "payload_locked_documents_rels_ai_usage_daily_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_usage_daily_id");
  CREATE INDEX "payload_locked_documents_rels_ai_audit_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_audit_id");
  CREATE INDEX "payload_locked_documents_rels_ai_generations_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_generations_id");
  CREATE INDEX "payload_locked_documents_rels_ai_bulk_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_bulk_runs_id");
  CREATE INDEX "payload_locked_documents_rels_ai_search_events_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_search_events_id");
  CREATE INDEX "payload_locked_documents_rels_ai_search_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_search_reports_id");
  CREATE INDEX "payload_locked_documents_rels_ai_recs_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_recs_id");
  CREATE INDEX "payload_locked_documents_rels_ai_assistant_verifications_idx" ON "payload_locked_documents_rels" USING btree ("ai_assistant_verifications_id");
  CREATE INDEX "payload_locked_documents_rels_ai_segments_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_segments_id");
  CREATE INDEX "payload_locked_documents_rels_ai_campaigns_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_campaigns_id");
  CREATE INDEX "payload_locked_documents_rels_ai_email_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_email_drafts_id");
  CREATE INDEX "payload_locked_documents_rels_ai_unsubscribes_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_unsubscribes_id");
  CREATE INDEX "payload_locked_documents_rels_ai_review_insights_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_review_insights_id");
  CREATE INDEX "payload_locked_documents_rels_ai_review_flags_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_review_flags_id");
  CREATE INDEX "payload_locked_documents_rels_ai_channel_identities_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_channel_identities_id");
  CREATE INDEX "payload_locked_documents_rels_ai_channel_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_channel_messages_id");
  CREATE INDEX "payload_locked_documents_rels_ai_insight_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_insight_reports_id");
  CREATE INDEX "payload_locked_documents_rels_ai_copilot_changesets_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_copilot_changesets_id");
  CREATE INDEX "payload_locked_documents_rels_ai_automations_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_automations_id");
  CREATE INDEX "payload_locked_documents_rels_ai_automation_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_automation_runs_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "ai_settings_enabled_modules_order_idx" ON "ai_settings_enabled_modules" USING btree ("order");
  CREATE INDEX "ai_settings_enabled_modules_parent_idx" ON "ai_settings_enabled_modules" USING btree ("parent_id");
  CREATE INDEX "ai_settings_budgets_per_module_order_idx" ON "ai_settings_budgets_per_module" USING btree ("_order");
  CREATE INDEX "ai_settings_budgets_per_module_parent_id_idx" ON "ai_settings_budgets_per_module" USING btree ("_parent_id");
  CREATE INDEX "ai_settings_routes_order_idx" ON "ai_settings_routes" USING btree ("_order");
  CREATE INDEX "ai_settings_routes_parent_id_idx" ON "ai_settings_routes" USING btree ("_parent_id");
  CREATE INDEX "ai_settings_texts_order_parent" ON "ai_settings_texts" USING btree ("order","parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "media_locales" CASCADE;
  DROP TABLE "media_texts" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "categories_locales" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_locales" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "_pages_v_locales" CASCADE;
  DROP TABLE "posts" CASCADE;
  DROP TABLE "posts_locales" CASCADE;
  DROP TABLE "posts_rels" CASCADE;
  DROP TABLE "_posts_v" CASCADE;
  DROP TABLE "_posts_v_locales" CASCADE;
  DROP TABLE "_posts_v_rels" CASCADE;
  DROP TABLE "faqs" CASCADE;
  DROP TABLE "faqs_locales" CASCADE;
  DROP TABLE "policies" CASCADE;
  DROP TABLE "policies_locales" CASCADE;
  DROP TABLE "_policies_v" CASCADE;
  DROP TABLE "_policies_v_locales" CASCADE;
  DROP TABLE "reviews" CASCADE;
  DROP TABLE "addresses" CASCADE;
  DROP TABLE "variants" CASCADE;
  DROP TABLE "variants_rels" CASCADE;
  DROP TABLE "_variants_v" CASCADE;
  DROP TABLE "_variants_v_rels" CASCADE;
  DROP TABLE "variant_types" CASCADE;
  DROP TABLE "variant_options" CASCADE;
  DROP TABLE "products_gallery" CASCADE;
  DROP TABLE "products_specs" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "products_locales" CASCADE;
  DROP TABLE "products_texts" CASCADE;
  DROP TABLE "products_rels" CASCADE;
  DROP TABLE "_products_v_version_gallery" CASCADE;
  DROP TABLE "_products_v_version_specs" CASCADE;
  DROP TABLE "_products_v" CASCADE;
  DROP TABLE "_products_v_locales" CASCADE;
  DROP TABLE "_products_v_texts" CASCADE;
  DROP TABLE "_products_v_rels" CASCADE;
  DROP TABLE "carts_items" CASCADE;
  DROP TABLE "carts" CASCADE;
  DROP TABLE "orders_items" CASCADE;
  DROP TABLE "orders" CASCADE;
  DROP TABLE "orders_rels" CASCADE;
  DROP TABLE "transactions_items" CASCADE;
  DROP TABLE "transactions" CASCADE;
  DROP TABLE "ai_actions" CASCADE;
  DROP TABLE "ai_prompts" CASCADE;
  DROP TABLE "ai_conversations" CASCADE;
  DROP TABLE "ai_conversations_texts" CASCADE;
  DROP TABLE "ai_messages" CASCADE;
  DROP TABLE "ai_customer_memory" CASCADE;
  DROP TABLE "ai_tickets_replies" CASCADE;
  DROP TABLE "ai_tickets" CASCADE;
  DROP TABLE "ai_tickets_texts" CASCADE;
  DROP TABLE "ai_providers_headers" CASCADE;
  DROP TABLE "ai_providers" CASCADE;
  DROP TABLE "ai_models_capabilities" CASCADE;
  DROP TABLE "ai_models" CASCADE;
  DROP TABLE "ai_models_texts" CASCADE;
  DROP TABLE "ai_routes" CASCADE;
  DROP TABLE "ai_routes_texts" CASCADE;
  DROP TABLE "ai_usage" CASCADE;
  DROP TABLE "ai_usage_daily" CASCADE;
  DROP TABLE "ai_audit" CASCADE;
  DROP TABLE "ai_generations" CASCADE;
  DROP TABLE "ai_bulk_runs" CASCADE;
  DROP TABLE "ai_search_events" CASCADE;
  DROP TABLE "ai_search_reports_synonyms" CASCADE;
  DROP TABLE "ai_search_reports_missing_products" CASCADE;
  DROP TABLE "ai_search_reports" CASCADE;
  DROP TABLE "ai_recs" CASCADE;
  DROP TABLE "ai_assistant_verifications" CASCADE;
  DROP TABLE "ai_segments" CASCADE;
  DROP TABLE "ai_campaigns_steps_subject_variants" CASCADE;
  DROP TABLE "ai_campaigns_steps" CASCADE;
  DROP TABLE "ai_campaigns" CASCADE;
  DROP TABLE "ai_email_drafts" CASCADE;
  DROP TABLE "ai_unsubscribes" CASCADE;
  DROP TABLE "ai_review_insights" CASCADE;
  DROP TABLE "ai_review_flags" CASCADE;
  DROP TABLE "ai_channel_identities" CASCADE;
  DROP TABLE "ai_channel_messages" CASCADE;
  DROP TABLE "ai_insight_reports" CASCADE;
  DROP TABLE "ai_copilot_changesets" CASCADE;
  DROP TABLE "ai_automations_steps" CASCADE;
  DROP TABLE "ai_automations" CASCADE;
  DROP TABLE "ai_automations_texts" CASCADE;
  DROP TABLE "ai_automation_runs" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "ai_settings_enabled_modules" CASCADE;
  DROP TABLE "ai_settings_budgets_per_module" CASCADE;
  DROP TABLE "ai_settings_routes" CASCADE;
  DROP TABLE "ai_settings" CASCADE;
  DROP TABLE "ai_settings_texts" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_users_preferred_locale";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum__pages_v_published_locale";
  DROP TYPE "public"."enum_posts_status";
  DROP TYPE "public"."enum__posts_v_version_status";
  DROP TYPE "public"."enum__posts_v_published_locale";
  DROP TYPE "public"."enum_faqs_topic";
  DROP TYPE "public"."enum_policies_kind";
  DROP TYPE "public"."enum_policies_status";
  DROP TYPE "public"."enum__policies_v_version_kind";
  DROP TYPE "public"."enum__policies_v_version_status";
  DROP TYPE "public"."enum__policies_v_published_locale";
  DROP TYPE "public"."enum_reviews_locale";
  DROP TYPE "public"."enum_reviews_status";
  DROP TYPE "public"."enum_addresses_country";
  DROP TYPE "public"."enum_variants_status";
  DROP TYPE "public"."enum__variants_v_version_status";
  DROP TYPE "public"."enum__variants_v_published_locale";
  DROP TYPE "public"."enum_products_status";
  DROP TYPE "public"."enum__products_v_version_status";
  DROP TYPE "public"."enum__products_v_published_locale";
  DROP TYPE "public"."enum_carts_currency";
  DROP TYPE "public"."enum_orders_status";
  DROP TYPE "public"."enum_orders_currency";
  DROP TYPE "public"."enum_orders_shipping_status";
  DROP TYPE "public"."enum_transactions_status";
  DROP TYPE "public"."enum_transactions_currency";
  DROP TYPE "public"."enum_ai_actions_tier";
  DROP TYPE "public"."enum_ai_actions_status";
  DROP TYPE "public"."enum_ai_prompts_task";
  DROP TYPE "public"."enum_ai_prompts_model_class";
  DROP TYPE "public"."enum_ai_prompts_status";
  DROP TYPE "public"."enum_ai_conversations_surface";
  DROP TYPE "public"."enum_ai_conversations_status";
  DROP TYPE "public"."enum_ai_messages_role";
  DROP TYPE "public"."enum_ai_messages_feedback";
  DROP TYPE "public"."enum_ai_tickets_replies_channel";
  DROP TYPE "public"."enum_ai_tickets_source";
  DROP TYPE "public"."enum_ai_tickets_status";
  DROP TYPE "public"."enum_ai_tickets_priority";
  DROP TYPE "public"."enum_ai_tickets_sentiment";
  DROP TYPE "public"."enum_ai_providers_type";
  DROP TYPE "public"."enum_ai_providers_status";
  DROP TYPE "public"."enum_ai_models_capabilities";
  DROP TYPE "public"."enum_ai_routes_task_class";
  DROP TYPE "public"."enum_ai_routes_scope";
  DROP TYPE "public"."enum_ai_usage_task";
  DROP TYPE "public"."enum_ai_usage_outcome";
  DROP TYPE "public"."enum_ai_generations_field_type";
  DROP TYPE "public"."enum_ai_generations_action";
  DROP TYPE "public"."enum_ai_bulk_runs_status";
  DROP TYPE "public"."enum_ai_bulk_runs_action";
  DROP TYPE "public"."enum_ai_search_events_type";
  DROP TYPE "public"."enum_ai_search_events_mode";
  DROP TYPE "public"."enum_ai_search_events_source";
  DROP TYPE "public"."enum_ai_search_reports_synonyms_status";
  DROP TYPE "public"."enum_ai_search_reports_missing_products_status";
  DROP TYPE "public"."enum_ai_recs_kind";
  DROP TYPE "public"."enum_ai_assistant_verifications_status";
  DROP TYPE "public"."enum_ai_campaigns_kind";
  DROP TYPE "public"."enum_ai_campaigns_status";
  DROP TYPE "public"."enum_ai_email_drafts_status";
  DROP TYPE "public"."enum_ai_unsubscribes_source";
  DROP TYPE "public"."enum_ai_review_flags_label";
  DROP TYPE "public"."enum_ai_review_flags_status";
  DROP TYPE "public"."enum_ai_channel_identities_channel";
  DROP TYPE "public"."enum_ai_channel_messages_channel";
  DROP TYPE "public"."enum_ai_channel_messages_direction";
  DROP TYPE "public"."enum_ai_channel_messages_status";
  DROP TYPE "public"."enum_ai_insight_reports_kind";
  DROP TYPE "public"."enum_ai_insight_reports_verification";
  DROP TYPE "public"."enum_ai_copilot_changesets_status";
  DROP TYPE "public"."enum_ai_automations_steps_type";
  DROP TYPE "public"."enum_ai_automations_trigger_type";
  DROP TYPE "public"."enum_ai_automations_trigger_operation";
  DROP TYPE "public"."enum_ai_automations_approval_role";
  DROP TYPE "public"."enum_ai_automations_action_type";
  DROP TYPE "public"."enum_ai_automations_action_channel";
  DROP TYPE "public"."enum_ai_automation_runs_status";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_ai_settings_enabled_modules";
  DROP TYPE "public"."enum_ai_settings_budgets_per_module_module";
  DROP TYPE "public"."enum_ai_settings_routes_task";`)
}
