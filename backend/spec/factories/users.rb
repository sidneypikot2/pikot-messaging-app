FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    password { "password123" }
    password_confirmation { "password123" }

    trait :verified do
      verified_at { Time.current }
    end

    trait :oauth do
      password { nil }
      password_confirmation { nil }
      provider { "facebook" }
      sequence(:uid) { |n| "facebook-uid-#{n}" }
      verified_at { Time.current }
    end
  end
end
