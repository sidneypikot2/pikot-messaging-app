module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user
    end

    private

    # The browser WebSocket API can't set custom headers, so the JWT travels as a query
    # param on the connection URL instead of Authorization: Bearer (the standard Rails
    # pattern for token-based Action Cable auth, since this app has no session cookie to
    # authenticate the handshake with otherwise).
    def find_verified_user
      payload = JsonWebToken.decode(request.params[:token])
      (payload && User.find_by(id: payload[:user_id])) || reject_unauthorized_connection
    end
  end
end
