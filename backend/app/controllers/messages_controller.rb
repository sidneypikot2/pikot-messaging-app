class MessagesController < ApplicationController
  before_action :authenticate_request!

  PAGE_LIMIT = 30

  def index
    conversation = current_user.conversations.find(params[:conversation_id])
    limit = [ params[:limit].to_i, PAGE_LIMIT ].reject(&:zero?).min || PAGE_LIMIT

    scope = conversation.messages.includes(:sender, reply_to_message: :sender).order(id: :desc).limit(limit + 1)
    scope = scope.where("messages.id < ?", params[:before]) if params[:before].present?
    scope = scope.where.not(id: current_user.message_hides.select(:message_id))
    cleared = conversation.membership_for(current_user).cleared_message_id
    scope = scope.where("messages.id > ?", cleared) if cleared # "delete chat" (KAN-41)

    page = scope.to_a
    has_more = page.size > limit

    render json: { messages: page.first(limit).reverse.map { |m| MessageSerializer.call(m, current_user: current_user) }, has_more: has_more }
  end

  def create
    conversation = current_user.conversations.find(params[:conversation_id])
    message = Messages::CreateService.call(
      conversation: conversation, sender: current_user, body: params[:body], reply_to_message_id: params[:reply_to_message_id]
    )
    render json: { message: MessageSerializer.call(message, current_user: current_user) }, status: :created
  end

  def update
    message = Messages::UpdateService.call(message: Message.find(params[:id]), sender: current_user, body: params[:body])
    render json: { message: MessageSerializer.call(message, current_user: current_user) }
  end

  # scope=me is "Unsend for you" (KAN-30); anything else unsends for everyone.
  def destroy
    message = Message.find(params[:id])
    if params[:scope] == "me"
      Messages::HideService.call(message: message, user: current_user)
    else
      Messages::DeleteService.call(message: message, sender: current_user)
    end
    head :no_content
  end

  def toggle_reaction
    message = Message.find(params[:id])
    Reactions::ToggleService.call(message: message, user: current_user, emoji: params[:emoji])
    render json: { message_id: message.id }
  end
end
