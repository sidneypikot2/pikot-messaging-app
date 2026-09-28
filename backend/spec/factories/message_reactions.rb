FactoryBot.define do
  factory :message_reaction do
    message
    user
    emoji { "👍" }
  end
end
