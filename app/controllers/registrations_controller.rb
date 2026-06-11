class RegistrationsController < ApplicationController
  allow_unauthenticated_access only: %i[ create ]
  rate_limit to: 10, within: 3.minutes, only: :create, with: -> { redirect_to login_path, alert: "Muitas tentativas. Tente novamente em alguns minutos." }

  def create
    user = User.new(params.permit(:name, :email_address, :password))
    if user.save
      start_new_session_for user
      redirect_to app_path
    else
      redirect_to login_path(tab: "registro"), alert: user.errors.full_messages.first
    end
  end
end
