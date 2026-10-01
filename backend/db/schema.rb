# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_01_080000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "conversation_memberships", force: :cascade do |t|
    t.bigint "conversation_id", null: false
    t.datetime "created_at", null: false
    t.datetime "last_read_at"
    t.bigint "last_read_message_id"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["conversation_id", "user_id"], name: "index_conversation_memberships_on_conversation_id_and_user_id", unique: true
    t.index ["conversation_id"], name: "index_conversation_memberships_on_conversation_id"
    t.index ["last_read_message_id"], name: "index_conversation_memberships_on_last_read_message_id"
    t.index ["user_id"], name: "index_conversation_memberships_on_user_id"
  end

  create_table "conversations", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "kind", default: 0, null: false
    t.string "name"
    t.bigint "owner_id"
    t.datetime "updated_at", null: false
    t.index ["owner_id"], name: "index_conversations_on_owner_id"
  end

  create_table "message_hides", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "message_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["message_id", "user_id"], name: "index_message_hides_on_message_id_and_user_id", unique: true
    t.index ["message_id"], name: "index_message_hides_on_message_id"
    t.index ["user_id"], name: "index_message_hides_on_user_id"
  end

  create_table "message_reactions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "emoji", null: false
    t.bigint "message_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["message_id", "user_id", "emoji"], name: "index_message_reactions_on_message_user_emoji", unique: true
    t.index ["message_id"], name: "index_message_reactions_on_message_id"
    t.index ["user_id"], name: "index_message_reactions_on_user_id"
  end

  create_table "messages", force: :cascade do |t|
    t.text "body", null: false
    t.bigint "conversation_id", null: false
    t.datetime "created_at", null: false
    t.datetime "deleted_at"
    t.datetime "edited_at"
    t.bigint "reply_to_message_id"
    t.bigint "sender_id", null: false
    t.datetime "updated_at", null: false
    t.index ["conversation_id", "id"], name: "index_messages_on_conversation_id_and_id"
    t.index ["conversation_id"], name: "index_messages_on_conversation_id"
    t.index ["reply_to_message_id"], name: "index_messages_on_reply_to_message_id"
    t.index ["sender_id"], name: "index_messages_on_sender_id"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "first_name"
    t.datetime "last_seen_at"
    t.string "last_name"
    t.string "password_digest"
    t.string "provider"
    t.string "uid"
    t.datetime "updated_at", null: false
    t.string "username"
    t.datetime "verified_at"
    t.index "lower((username)::text)", name: "index_users_on_lower_username", unique: true
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["provider", "uid"], name: "index_users_on_provider_and_uid", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "conversation_memberships", "conversations"
  add_foreign_key "conversation_memberships", "messages", column: "last_read_message_id"
  add_foreign_key "conversation_memberships", "users"
  add_foreign_key "conversations", "users", column: "owner_id"
  add_foreign_key "message_hides", "messages"
  add_foreign_key "message_hides", "users"
  add_foreign_key "message_reactions", "messages"
  add_foreign_key "message_reactions", "users"
  add_foreign_key "messages", "conversations"
  add_foreign_key "messages", "messages", column: "reply_to_message_id"
  add_foreign_key "messages", "users", column: "sender_id"
end
