require "rails_helper"

RSpec.describe Auth::PasswordAuthenticator do
  it "returns the user for correct, case-insensitive credentials" do
    user = create(:user, :verified, email: "user@example.com", password: "password123", password_confirmation: "password123")

    result = described_class.call(email: "USER@example.com", password: "password123")

    expect(result).to eq(user)
  end

  it "returns :invalid_credentials for a wrong password" do
    create(:user, :verified, email: "user@example.com", password: "password123", password_confirmation: "password123")

    expect(described_class.call(email: "user@example.com", password: "wrong")).to eq(:invalid_credentials)
  end

  it "returns :invalid_credentials for an unknown email" do
    expect(described_class.call(email: "nobody@example.com", password: "password123")).to eq(:invalid_credentials)
  end

  it "returns :unverified for correct credentials on an unverified account" do
    create(:user, email: "user@example.com", password: "password123", password_confirmation: "password123")

    expect(described_class.call(email: "user@example.com", password: "password123")).to eq(:unverified)
  end
end
