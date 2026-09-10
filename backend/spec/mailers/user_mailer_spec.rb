require "rails_helper"

RSpec.describe UserMailer, type: :mailer do
  describe "email_verification" do
    let(:user) { create(:user) }
    let(:mail) { UserMailer.email_verification(user) }

    it "renders the headers" do
      expect(mail.subject).to eq("Verify your email for PikotChat")
      expect(mail.to).to eq([ user.email ])
      expect(mail.from).to eq([ "from@example.com" ])
    end

    it "includes a verification link with a working token" do
      body = mail.body.encoded
      token = body[/token=([^\s"&<]+)/, 1]

      expect(token).to be_present
      expect(User.find_by_token_for(:email_verification, token)).to eq(user)
    end
  end
end
