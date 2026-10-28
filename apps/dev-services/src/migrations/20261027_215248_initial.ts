import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_users_roles" AS ENUM('super-admin', 'admin', 'content', 'marketing', 'support', 'manager', 'customer');
  CREATE TYPE "public"."enum_users_preferred_locale" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_services_category" AS ENUM('hair', 'skin', 'spa', 'health', 'consulting');
  CREATE TYPE "public"."enum_services_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__services_v_version_category" AS ENUM('hair', 'skin', 'spa', 'health', 'consulting');
  CREATE TYPE "public"."enum__services_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__services_v_published_locale" AS ENUM('en', 'bn');
  CREATE TYPE "public"."enum_locations_opening_hours_day" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
  CREATE TYPE "public"."enum_bookings_status" AS ENUM('tentative', 'confirmed', 'cancelled', 'completed');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_published_locale" AS ENUM('en', 'bn');
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
  CREATE TYPE "public"."enum_ai_assistant_verifications_status" AS ENUM('pending', 'verified', 'failed', 'superseded');
  CREATE TYPE "public"."enum_ai_review_flags_label" AS ENUM('abuse', 'spam');
  CREATE TYPE "public"."enum_ai_review_flags_status" AS ENUM('flagged', 'held', 'released');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'ai-core-index-knowledge', 'ai-core-knowledge-drift', 'ai-core-retention', 'ai-content-bulk', 'ai-search-index-offering', 'ai-search-reindex', 'ai-search-learning-report', 'ai-assistant-outcomes', 'ai-support-triage', 'ai-support-review-moderate', 'ai-support-review-insights');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'ai-core-index-knowledge', 'ai-core-knowledge-drift', 'ai-core-retention', 'ai-content-bulk', 'ai-search-index-offering', 'ai-search-reindex', 'ai-search-learning-report', 'ai-assistant-outcomes', 'ai-support-triage', 'ai-support-review-moderate', 'ai-support-review-insights');
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
  
  CREATE TABLE "services" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"price" numeric,
  	"duration" numeric DEFAULT 60,
  	"image_id" integer,
  	"category" "enum_services_category",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_services_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "services_locales" (
  	"title" varchar,
  	"description" jsonb,
  	"summary" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "services_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_services_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_price" numeric,
  	"version_duration" numeric DEFAULT 60,
  	"version_image_id" integer,
  	"version_category" "enum__services_v_version_category",
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__services_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__services_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_services_v_locales" (
  	"version_title" varchar,
  	"version_description" jsonb,
  	"version_summary" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_services_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "locations_opening_hours" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"day" "enum_locations_opening_hours_day" NOT NULL,
  	"open" varchar NOT NULL,
  	"close" varchar NOT NULL
  );
  
  CREATE TABLE "locations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"phone" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "locations_locales" (
  	"name" varchar NOT NULL,
  	"address" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "staff" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"location_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "staff_locales" (
  	"bio" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "staff_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"services_id" integer
  );
  
  CREATE TABLE "bookings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"service_id" integer NOT NULL,
  	"start" timestamp(3) with time zone NOT NULL,
  	"end" timestamp(3) with time zone,
  	"staff_id" integer,
  	"location_id" integer,
  	"status" "enum_bookings_status" DEFAULT 'tentative',
  	"customer_id" integer,
  	"name" varchar,
  	"email" varchar,
  	"phone" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
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
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "faqs" (
  	"id" serial PRIMARY KEY NOT NULL,
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
  	"services_id" integer,
  	"locations_id" integer,
  	"staff_id" integer,
  	"bookings_id" integer,
  	"pages_id" integer,
  	"faqs_id" integer,
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
  	"ai_assistant_verifications_id" integer,
  	"ai_review_insights_id" integer,
  	"ai_review_flags_id" integer
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
  	"budgets_monthly_micros" numeric DEFAULT 50000000,
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
  ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_texts" ADD CONSTRAINT "media_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services" ADD CONSTRAINT "services_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "services_locales" ADD CONSTRAINT "services_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_texts" ADD CONSTRAINT "services_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_services_v" ADD CONSTRAINT "_services_v_parent_id_services_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_services_v" ADD CONSTRAINT "_services_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_services_v_locales" ADD CONSTRAINT "_services_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_services_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_services_v_texts" ADD CONSTRAINT "_services_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_services_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "locations_opening_hours" ADD CONSTRAINT "locations_opening_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "locations_locales" ADD CONSTRAINT "locations_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "staff" ADD CONSTRAINT "staff_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "staff_locales" ADD CONSTRAINT "staff_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "staff_rels" ADD CONSTRAINT "staff_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "staff_rels" ADD CONSTRAINT "staff_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "faqs_locales" ADD CONSTRAINT "faqs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_locations_fk" FOREIGN KEY ("locations_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_staff_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bookings_fk" FOREIGN KEY ("bookings_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_assistant_verifications_fk" FOREIGN KEY ("ai_assistant_verifications_id") REFERENCES "public"."ai_assistant_verifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_review_insights_fk" FOREIGN KEY ("ai_review_insights_id") REFERENCES "public"."ai_review_insights"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ai_review_flags_fk" FOREIGN KEY ("ai_review_flags_id") REFERENCES "public"."ai_review_flags"("id") ON DELETE cascade ON UPDATE no action;
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
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "media_locales_parent_id_idx" ON "media_locales" USING btree ("_parent_id");
  CREATE INDEX "media_texts_order_parent" ON "media_texts" USING btree ("order","parent_id");
  CREATE UNIQUE INDEX "services_slug_idx" ON "services" USING btree ("slug");
  CREATE INDEX "services_image_idx" ON "services" USING btree ("image_id");
  CREATE INDEX "services_updated_at_idx" ON "services" USING btree ("updated_at");
  CREATE INDEX "services_created_at_idx" ON "services" USING btree ("created_at");
  CREATE INDEX "services__status_idx" ON "services" USING btree ("_status");
  CREATE UNIQUE INDEX "services_locales_locale_parent_id_unique" ON "services_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "services_locales_parent_id_idx" ON "services_locales" USING btree ("_parent_id");
  CREATE INDEX "services_texts_order_parent" ON "services_texts" USING btree ("order","parent_id");
  CREATE INDEX "_services_v_parent_idx" ON "_services_v" USING btree ("parent_id");
  CREATE INDEX "_services_v_version_version_slug_idx" ON "_services_v" USING btree ("version_slug");
  CREATE INDEX "_services_v_version_version_image_idx" ON "_services_v" USING btree ("version_image_id");
  CREATE INDEX "_services_v_version_version_updated_at_idx" ON "_services_v" USING btree ("version_updated_at");
  CREATE INDEX "_services_v_version_version_created_at_idx" ON "_services_v" USING btree ("version_created_at");
  CREATE INDEX "_services_v_version_version__status_idx" ON "_services_v" USING btree ("version__status");
  CREATE INDEX "_services_v_created_at_idx" ON "_services_v" USING btree ("created_at");
  CREATE INDEX "_services_v_updated_at_idx" ON "_services_v" USING btree ("updated_at");
  CREATE INDEX "_services_v_snapshot_idx" ON "_services_v" USING btree ("snapshot");
  CREATE INDEX "_services_v_published_locale_idx" ON "_services_v" USING btree ("published_locale");
  CREATE INDEX "_services_v_latest_idx" ON "_services_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_services_v_locales_locale_parent_id_unique" ON "_services_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_services_v_locales_parent_id_idx" ON "_services_v_locales" USING btree ("_parent_id");
  CREATE INDEX "_services_v_texts_order_parent" ON "_services_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "locations_opening_hours_order_idx" ON "locations_opening_hours" USING btree ("_order");
  CREATE INDEX "locations_opening_hours_parent_id_idx" ON "locations_opening_hours" USING btree ("_parent_id");
  CREATE INDEX "locations_updated_at_idx" ON "locations" USING btree ("updated_at");
  CREATE INDEX "locations_created_at_idx" ON "locations" USING btree ("created_at");
  CREATE UNIQUE INDEX "locations_locales_locale_parent_id_unique" ON "locations_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "locations_locales_parent_id_idx" ON "locations_locales" USING btree ("_parent_id");
  CREATE INDEX "staff_location_idx" ON "staff" USING btree ("location_id");
  CREATE INDEX "staff_updated_at_idx" ON "staff" USING btree ("updated_at");
  CREATE INDEX "staff_created_at_idx" ON "staff" USING btree ("created_at");
  CREATE UNIQUE INDEX "staff_locales_locale_parent_id_unique" ON "staff_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "staff_locales_parent_id_idx" ON "staff_locales" USING btree ("_parent_id");
  CREATE INDEX "staff_rels_order_idx" ON "staff_rels" USING btree ("order");
  CREATE INDEX "staff_rels_parent_idx" ON "staff_rels" USING btree ("parent_id");
  CREATE INDEX "staff_rels_path_idx" ON "staff_rels" USING btree ("path");
  CREATE INDEX "staff_rels_services_id_idx" ON "staff_rels" USING btree ("services_id");
  CREATE INDEX "bookings_service_idx" ON "bookings" USING btree ("service_id");
  CREATE INDEX "bookings_staff_idx" ON "bookings" USING btree ("staff_id");
  CREATE INDEX "bookings_location_idx" ON "bookings" USING btree ("location_id");
  CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("customer_id");
  CREATE INDEX "bookings_updated_at_idx" ON "bookings" USING btree ("updated_at");
  CREATE INDEX "bookings_created_at_idx" ON "bookings" USING btree ("created_at");
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
  CREATE INDEX "faqs_updated_at_idx" ON "faqs" USING btree ("updated_at");
  CREATE INDEX "faqs_created_at_idx" ON "faqs" USING btree ("created_at");
  CREATE UNIQUE INDEX "faqs_locales_locale_parent_id_unique" ON "faqs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "faqs_locales_parent_id_idx" ON "faqs_locales" USING btree ("_parent_id");
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
  CREATE INDEX "ai_assistant_verifications_conversation_idx" ON "ai_assistant_verifications" USING btree ("conversation");
  CREATE INDEX "ai_assistant_verifications_owner_idx" ON "ai_assistant_verifications" USING btree ("owner");
  CREATE INDEX "ai_assistant_verifications_status_idx" ON "ai_assistant_verifications" USING btree ("status");
  CREATE INDEX "ai_assistant_verifications_verified_until_idx" ON "ai_assistant_verifications" USING btree ("verified_until");
  CREATE INDEX "ai_assistant_verifications_updated_at_idx" ON "ai_assistant_verifications" USING btree ("updated_at");
  CREATE INDEX "ai_assistant_verifications_created_at_idx" ON "ai_assistant_verifications" USING btree ("created_at");
  CREATE INDEX "ai_review_insights_offering_id_idx" ON "ai_review_insights" USING btree ("offering_id");
  CREATE INDEX "ai_review_insights_period_start_idx" ON "ai_review_insights" USING btree ("period_start");
  CREATE INDEX "ai_review_insights_updated_at_idx" ON "ai_review_insights" USING btree ("updated_at");
  CREATE INDEX "ai_review_insights_created_at_idx" ON "ai_review_insights" USING btree ("created_at");
  CREATE INDEX "ai_review_flags_review_id_idx" ON "ai_review_flags" USING btree ("review_id");
  CREATE INDEX "ai_review_flags_offering_id_idx" ON "ai_review_flags" USING btree ("offering_id");
  CREATE INDEX "ai_review_flags_status_idx" ON "ai_review_flags" USING btree ("status");
  CREATE INDEX "ai_review_flags_updated_at_idx" ON "ai_review_flags" USING btree ("updated_at");
  CREATE INDEX "ai_review_flags_created_at_idx" ON "ai_review_flags" USING btree ("created_at");
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
  CREATE INDEX "payload_locked_documents_rels_services_id_idx" ON "payload_locked_documents_rels" USING btree ("services_id");
  CREATE INDEX "payload_locked_documents_rels_locations_id_idx" ON "payload_locked_documents_rels" USING btree ("locations_id");
  CREATE INDEX "payload_locked_documents_rels_staff_id_idx" ON "payload_locked_documents_rels" USING btree ("staff_id");
  CREATE INDEX "payload_locked_documents_rels_bookings_id_idx" ON "payload_locked_documents_rels" USING btree ("bookings_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_faqs_id_idx" ON "payload_locked_documents_rels" USING btree ("faqs_id");
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
  CREATE INDEX "payload_locked_documents_rels_ai_assistant_verifications_idx" ON "payload_locked_documents_rels" USING btree ("ai_assistant_verifications_id");
  CREATE INDEX "payload_locked_documents_rels_ai_review_insights_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_review_insights_id");
  CREATE INDEX "payload_locked_documents_rels_ai_review_flags_id_idx" ON "payload_locked_documents_rels" USING btree ("ai_review_flags_id");
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
  DROP TABLE "services" CASCADE;
  DROP TABLE "services_locales" CASCADE;
  DROP TABLE "services_texts" CASCADE;
  DROP TABLE "_services_v" CASCADE;
  DROP TABLE "_services_v_locales" CASCADE;
  DROP TABLE "_services_v_texts" CASCADE;
  DROP TABLE "locations_opening_hours" CASCADE;
  DROP TABLE "locations" CASCADE;
  DROP TABLE "locations_locales" CASCADE;
  DROP TABLE "staff" CASCADE;
  DROP TABLE "staff_locales" CASCADE;
  DROP TABLE "staff_rels" CASCADE;
  DROP TABLE "bookings" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_locales" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "_pages_v_locales" CASCADE;
  DROP TABLE "faqs" CASCADE;
  DROP TABLE "faqs_locales" CASCADE;
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
  DROP TABLE "ai_assistant_verifications" CASCADE;
  DROP TABLE "ai_review_insights" CASCADE;
  DROP TABLE "ai_review_flags" CASCADE;
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
  DROP TYPE "public"."enum_services_category";
  DROP TYPE "public"."enum_services_status";
  DROP TYPE "public"."enum__services_v_version_category";
  DROP TYPE "public"."enum__services_v_version_status";
  DROP TYPE "public"."enum__services_v_published_locale";
  DROP TYPE "public"."enum_locations_opening_hours_day";
  DROP TYPE "public"."enum_bookings_status";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum__pages_v_published_locale";
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
  DROP TYPE "public"."enum_ai_assistant_verifications_status";
  DROP TYPE "public"."enum_ai_review_flags_label";
  DROP TYPE "public"."enum_ai_review_flags_status";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_ai_settings_enabled_modules";
  DROP TYPE "public"."enum_ai_settings_budgets_per_module_module";
  DROP TYPE "public"."enum_ai_settings_routes_task";`)
}
