FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    password { "password123" }
    password_confirmation { "password123" }
    first_name { "Test" }
    last_name { "User" }
    sequence(:username) { |n| "user#{n}" }

    trait :verified do
      verified_at { Time.current }
    end

    trait :with_avatar do
      after(:build) do |user|
        user.avatar.attach(
          io: File.open(Rails.root.join("spec/fixtures/files/avatar.png")),
          filename: "avatar.png",
          content_type: "image/png"
        )
      end
    end

    trait :oauth do
      password { nil }
      password_confirmation { nil }
      # OAuth signup doesn't collect these (see User's `if: -> { !oauth_user? }` validations),
      # so real OAuth users have them blank — matched here rather than inheriting the base
      # factory's defaults.
      first_name { nil }
      last_name { nil }
      username { nil }
      provider { "facebook" }
      sequence(:uid) { |n| "facebook-uid-#{n}" }
      verified_at { Time.current }
    end
  end
end
