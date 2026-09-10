# Base class for service objects: plain Ruby objects with one public entry point.
# Subclasses implement #call (and an #initialize for whatever it needs); callers use
# the class method, e.g. Auth::SessionIssuer.call(user).
class ApplicationService
  def self.call(...)
    new(...).call
  end
end
