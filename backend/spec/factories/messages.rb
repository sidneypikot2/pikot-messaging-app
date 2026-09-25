FactoryBot.define do
  factory :message do
    conversation
    sender factory: :user
    body { "Hello there" }
  end
end
