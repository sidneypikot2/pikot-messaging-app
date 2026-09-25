class MessagesController < ApplicationController
  before_action :authenticate_request!

  PAGE_LIMIT = 30

  def index
    conversation = current_user.conversations.find(params[:conversation_id])
    limit = [ params[:limit].to_i, PAGE_LIMIT ].reject(&:zero?).min || PAGE_LIMIT

    scope = conversation.messages.order(id: :desc).limit(limit + 1)
    scope = scope.where("messages.id < ?", params[:before]) if params[:before].present?

    page = scope.to_a
    has_more = page.size > limit

    render json: { messages: page.first(limit).reverse.map { |m| MessageSerializer.call(m) }, has_more: has_more }
  end

  def create
    conversation = current_user.conversations.find(params[:conversation_id])
    message = Messages::CreateService.call(conversation: conversation, sender: current_user, body: params[:body])
    render json: { message: MessageSerializer.call(message) }, status: :created
  end

  def update
    message = Messages::UpdateService.call(message: Message.find(params[:id]), sender: current_user, body: params[:body])
    render json: { message: MessageSerializer.call(message) }
  end

  def destroy
    Messages::DeleteService.call(message: Message.find(params[:id]), sender: current_user)
    head :no_content
  end
end
