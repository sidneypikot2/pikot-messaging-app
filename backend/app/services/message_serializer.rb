class MessageSerializer < ApplicationService
  def initialize(message)
    @message = message
  end

  def call
    {
      id: @message.id,
      conversation_id: @message.conversation_id,
      sender: UserSerializer.call(@message.sender),
      body: @message.deleted? ? nil : @message.body,
      deleted: @message.deleted?,
      edited: @message.edited?,
      created_at: @message.created_at,
      updated_at: @message.updated_at
    }
  end
end
