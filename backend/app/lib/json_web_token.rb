class JsonWebToken
  ALGORITHM = "HS256"

  def self.encode(expires_in: 24.hours, **payload)
    payload[:exp] = expires_in.from_now.to_i
    JWT.encode(payload, Rails.application.secret_key_base, ALGORITHM)
  end

  def self.decode(token)
    decoded = JWT.decode(token, Rails.application.secret_key_base, true, algorithm: ALGORITHM)
    ActiveSupport::HashWithIndifferentAccess.new(decoded.first)
  rescue JWT::DecodeError, JWT::ExpiredSignature
    nil
  end
end
