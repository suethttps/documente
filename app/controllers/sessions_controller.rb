class SessionsController < ApplicationController
  allow_unauthenticated_access only: %i[ new create ]
  rate_limit to: 10, within: 3.minutes, only: :create, with: -> { redirect_to login_path, alert: "Muitas tentativas. Tente novamente em alguns minutos." }

  def new
    redirect_to app_path if authenticated?
  end

  def create
    if user = User.authenticate_by(params.permit(:email_address, :password))
      start_new_session_for user
      redirect_to app_path
    else
      redirect_to login_path, alert: "E-mail ou senha incorretos."
    end
  end

  def destroy
    terminate_session
    redirect_to root_path, status: :see_other
  end
end
