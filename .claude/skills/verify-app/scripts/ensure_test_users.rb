# Ensures the three throwaway test accounts used for manual verification exist in the
# development database, are verified, and share one known password. Idempotent.
#
#   docker compose exec -T -e RAILS_ENV=development backend bin/rails runner - \
#     < .claude/skills/verify-app/scripts/ensure_test_users.rb
abort "ensure_test_users.rb is development-only (RAILS_ENV=#{Rails.env})" unless Rails.env.development?

PASSWORD = "password123"

[
  [ "alice@example.com", "Alice", "Tester", "alice_test" ],
  [ "bob@example.com",   "Bob",   "Tester", "bob_test" ],
  [ "carol@example.com", "Carol", "Tester", "carol_test" ]
].each do |email, first_name, last_name, username|
  user = User.find_or_initialize_by(email: email)
  created = user.new_record?
  # Names/username are only set on creation so an existing account keeps whatever it has.
  user.assign_attributes(first_name: first_name, last_name: last_name, username: username) if created
  user.password = PASSWORD
  user.password_confirmation = PASSWORD
  user.verified_at ||= Time.current
  user.save!
  puts "#{created ? 'created' : 'ok     '} #{email} (@#{user.username}) password: #{PASSWORD}"
end
