# Group members and per-chat nicknames (KAN-41). :id is the member's user id.
class ConversationMembersController < ApplicationController
  before_action :authenticate_request!
  before_action :set_conversation

  def create
    Conversations::AddMembersService.call(conversation: @conversation, user: current_user, member_ids: params[:member_ids])
    render_conversation
  end

  def update
    Conversations::NicknameService.call(conversation: @conversation, user: current_user, member_id: params[:id], nickname: params[:nickname])
    render_conversation
  end

  # Removing yourself is leaving the group.
  def destroy
    Conversations::RemoveMemberService.call(conversation: @conversation, user: current_user, member_id: params[:id])
    head :no_content
  end

  private

  def set_conversation
    @conversation = current_user.conversations.find(params[:conversation_id])
  end

  def render_conversation
    render json: { conversation: ConversationSerializer.call(@conversation.reload, current_user: current_user) }
  end
end
