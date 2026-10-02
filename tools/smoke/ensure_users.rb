# Ensures the two accounts the smoke test signs in with exist in the development
# database, are verified and have the password the test uses. Idempotent. Run by
# script/smoke:
#
#   docker compose exec -T -e RAILS_ENV=development backend bin/rails runner - \
#     < tools/smoke/ensure_users.rb
abort "ensure_users.rb is development-only (RAILS_ENV=#{Rails.env})" unless Rails.env.development?

PASSWORD = "smoke-test-password"

[
  [ "smoke-alice@example.com", "Smoke", "Alice", "smoke_alice" ],
  [ "smoke-bob@example.com",   "Smoke", "Bob",   "smoke_bob" ]
].each do |email, first_name, last_name, username|
  user = User.find_or_initialize_by(email: email)
  # The test finds these accounts by name and username, so they are reset every run.
  user.assign_attributes(first_name: first_name, last_name: last_name, username: username)
  user.password = PASSWORD
  user.password_confirmation = PASSWORD
  user.verified_at ||= Time.current
  user.save!
end
